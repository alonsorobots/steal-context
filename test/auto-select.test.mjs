// Uses only synthetic fixture data — never real user history.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { steal } from "../src/steal.mjs";
import { slugFor } from "../src/readers/cursor.mjs";

function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

function writeCursorSession(cursorRoot, project, uuid, mtime, records) {
  const dir = join(cursorRoot, slugFor(project), "agent-transcripts", uuid);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${uuid}.jsonl`);
  writeFileSync(file, records.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  utimesSync(file, mtime, mtime);
}

function writeClaudeCodeSession(claudeRoot, project, sessionId, mtime, records) {
  const dir = join(claudeRoot, "some-project-dir"); // deliberately not slug-derived
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${sessionId}.jsonl`);
  writeFileSync(file, records.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  utimesSync(file, mtime, mtime);
}

test("--from auto picks the tool the human used most recently", async () => {
  const cursorRoot = mkdtempSync(join(tmpdir(), "steal-auto-cursor-"));
  const claudeRoot = mkdtempSync(join(tmpdir(), "steal-auto-claude-"));
  const projectRoot = mkdtempSync(join(tmpdir(), "steal-auto-project-"));
  try {
    const older = new Date("2026-01-01T00:00:00Z");
    const newer = new Date("2026-06-01T00:00:00Z");

    writeCursorSession(cursorRoot, projectRoot, "11111111-1111-1111-1111-111111111111", older, [
      { role: "user", message: { content: [{ type: "text", text: "<user_query>cursor turn</user_query>" }] } },
    ]);
    writeClaudeCodeSession(claudeRoot, projectRoot, "session-newer", newer, [
      { type: "user", sessionId: "session-newer", cwd: projectRoot, timestamp: newer.toISOString(),
        message: { role: "user", content: "claude code turn" } },
    ]);

    withEnv({ STEAL_CURSOR_PROJECTS: cursorRoot, STEAL_CLAUDE_PROJECTS: claudeRoot }, () => {
      const result = steal({ from: "auto", to: "kilo-code", project: projectRoot, format: "markdown" });
      assert.equal(result.fromTool.source, "claude-code", "the newer human turn should win regardless of tool");
    });
  } finally {
    rmSync(cursorRoot, { recursive: true, force: true });
    rmSync(claudeRoot, { recursive: true, force: true });
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("--from auto prefers last human turn over a still-writing agent's store mtime", async () => {
  // Reproduces the real bug: Claude Code keeps appending assistant/tool_result
  // rows (bumping JSONL mtime) after the human has already moved to another
  // tool. Auto must rank by last real human turn, not file mtime.
  const cursorRoot = mkdtempSync(join(tmpdir(), "steal-auto-cursor-human-"));
  const claudeRoot = mkdtempSync(join(tmpdir(), "steal-auto-claude-agent-"));
  const projectRoot = mkdtempSync(join(tmpdir(), "steal-auto-project-human-"));
  try {
    const claudeHumanAt = "2026-06-01T12:00:00.000Z"; // human spoke here first
    const cursorHumanMtime = new Date("2026-06-01T13:00:00.000Z"); // then moved to Cursor
    const claudeAgentStillWriting = new Date("2026-06-01T14:00:00.000Z"); // Claude agent keeps writing

    writeCursorSession(cursorRoot, projectRoot, "33333333-3333-3333-3333-333333333333", cursorHumanMtime, [
      { role: "user", message: { content: [{ type: "text", text: "<user_query>I switched to cursor</user_query>" }] } },
    ]);

    writeClaudeCodeSession(claudeRoot, projectRoot, "session-still-writing", claudeAgentStillWriting, [
      {
        type: "user",
        sessionId: "session-still-writing",
        cwd: projectRoot,
        timestamp: claudeHumanAt,
        message: { role: "user", content: "start a long task in claude" },
      },
      {
        type: "assistant",
        sessionId: "session-still-writing",
        cwd: projectRoot,
        timestamp: "2026-06-01T12:00:01.000Z",
        message: {
          role: "assistant",
          model: "claude-test",
          content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "sleep 1" } }],
        },
      },
      // Claude records tool results as type:"user" — must NOT count as human.
      {
        type: "user",
        sessionId: "session-still-writing",
        cwd: projectRoot,
        timestamp: "2026-06-01T13:59:00.000Z",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }],
        },
      },
      {
        type: "assistant",
        sessionId: "session-still-writing",
        cwd: projectRoot,
        timestamp: "2026-06-01T14:00:00.000Z",
        message: {
          role: "assistant",
          model: "claude-test",
          content: [{ type: "text", text: "still working after you left" }],
        },
      },
    ]);

    withEnv({ STEAL_CURSOR_PROJECTS: cursorRoot, STEAL_CLAUDE_PROJECTS: claudeRoot }, () => {
      const result = steal({ from: "auto", to: "kilo-code", project: projectRoot, format: "markdown" });
      assert.equal(
        result.fromTool.source,
        "cursor",
        "Cursor's later human turn must beat Claude's newer agent-only mtime",
      );
      assert.match(result.text, /I switched to cursor/);
    });
  } finally {
    rmSync(cursorRoot, { recursive: true, force: true });
    rmSync(claudeRoot, { recursive: true, force: true });
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("--from auto never selects the destination tool, even if it has the newest session", async () => {
  const cursorRoot = mkdtempSync(join(tmpdir(), "steal-auto-cursor-"));
  const claudeRoot = mkdtempSync(join(tmpdir(), "steal-auto-claude-"));
  const projectRoot = mkdtempSync(join(tmpdir(), "steal-auto-project-"));
  try {
    const older = new Date("2026-01-01T00:00:00Z");
    const newer = new Date("2026-06-01T00:00:00Z");

    writeCursorSession(cursorRoot, projectRoot, "22222222-2222-2222-2222-222222222222", older, [
      { role: "user", message: { content: [{ type: "text", text: "<user_query>cursor turn</user_query>" }] } },
    ]);
    // claude-code has the newer session, but it's also the destination here.
    writeClaudeCodeSession(claudeRoot, projectRoot, "session-newer-2", newer, [
      { type: "user", sessionId: "session-newer-2", cwd: projectRoot,
        message: { role: "user", content: "claude code turn" } },
    ]);

    withEnv({ STEAL_CURSOR_PROJECTS: cursorRoot, STEAL_CLAUDE_PROJECTS: claudeRoot }, () => {
      const result = steal({ from: "auto", to: "claude-code", project: projectRoot, format: "markdown" });
      assert.equal(result.fromTool.source, "cursor", "claude-code is the destination and must be excluded");
    });
  } finally {
    rmSync(cursorRoot, { recursive: true, force: true });
    rmSync(claudeRoot, { recursive: true, force: true });
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("--from auto throws a clear error when no other tool has a session for this project", async () => {
  const cursorRoot = mkdtempSync(join(tmpdir(), "steal-auto-cursor-empty-"));
  const claudeRoot = mkdtempSync(join(tmpdir(), "steal-auto-claude-empty-"));
  const projectRoot = mkdtempSync(join(tmpdir(), "steal-auto-project-empty-"));
  try {
    withEnv({ STEAL_CURSOR_PROJECTS: cursorRoot, STEAL_CLAUDE_PROJECTS: claudeRoot }, () => {
      assert.throws(
        () => steal({ from: "auto", to: "claude-code", project: projectRoot, format: "markdown" }),
        /auto found no sessions/,
      );
    });
  } finally {
    rmSync(cursorRoot, { recursive: true, force: true });
    rmSync(claudeRoot, { recursive: true, force: true });
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
