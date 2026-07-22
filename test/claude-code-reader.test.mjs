// Uses only synthetic fixture data — never real user history.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function withFixture(fn) {
  const root = mkdtempSync(join(tmpdir(), "steal-cc-"));
  const prev = process.env.STEAL_CLAUDE_PROJECTS;
  process.env.STEAL_CLAUDE_PROJECTS = root;
  try {
    await fn(root);
  } finally {
    if (prev === undefined) delete process.env.STEAL_CLAUDE_PROJECTS;
    else process.env.STEAL_CLAUDE_PROJECTS = prev;
    rmSync(root, { recursive: true, force: true });
  }
}

function writeSession(root, projectDirName, fileName, records) {
  const dir = join(root, projectDirName);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, fileName);
  writeFileSync(file, records.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  return file;
}

// A fresh import per test would require dynamic import cache-busting, but
// since `available()`/`latest()` read `process.env.STEAL_CLAUDE_PROJECTS` at
// call time (not at module-load time), one static import is fine.
const reader = await import("../src/readers/claude-code.mjs");

test("available() reflects STEAL_CLAUDE_PROJECTS", async () => {
  await withFixture(async (root) => {
    assert.equal(reader.available(), true);
  });
});

test("latest() matches by cwd field, not directory name", async () => {
  await withFixture(async (root) => {
    const project = "/home/example/some-project";
    writeSession(root, "totally-unrelated-dir-name", "session-a.jsonl", [
      { type: "user", sessionId: "s1", cwd: project, timestamp: "2026-01-01T00:00:00Z",
        message: { role: "user", content: "hello from the human" } },
      { type: "assistant", sessionId: "s1", cwd: project, timestamp: "2026-01-01T00:00:01Z",
        message: { role: "assistant", model: "claude-test-1", content: [{ type: "text", text: "hi there" }] } },
    ]);

    const sess = reader.latest(project, { limit: 40 });
    assert.ok(sess, "expected a session to be found");
    assert.equal(sess.source, "claude-code");
    assert.equal(sess.model, "claude-test-1");
    assert.equal(sess.messages.length, 2);
    assert.equal(sess.messages[0].role, "user");
    assert.equal(sess.messages[0].blocks[0].kind, "text");
    assert.equal(sess.messages[0].blocks[0].text, "hello from the human");
  });
});

test("latest() picks the newest of several matching sessions by mtime", async () => {
  await withFixture(async (root) => {
    const project = "/home/example/multi-session-project";
    const older = writeSession(root, "proj", "older.jsonl", [
      { type: "user", sessionId: "old", cwd: project, timestamp: "2026-01-01T00:00:00Z",
        message: { role: "user", content: "old session" } },
    ]);
    // Ensure a distinct, later mtime than the "older" file.
    await new Promise((r) => setTimeout(r, 20));
    writeSession(root, "proj", "newer.jsonl", [
      { type: "user", sessionId: "new", cwd: project, timestamp: "2026-01-02T00:00:00Z",
        message: { role: "user", content: "new session" } },
    ]);

    const sess = reader.latest(project, { limit: 40 });
    assert.equal(sess.id, "new");
    assert.equal(sess.messages[0].blocks[0].text, "new session");
    void older;
  });
});

test("latest() ignores sidechain (subagent) and meta records", async () => {
  await withFixture(async (root) => {
    const project = "/home/example/filter-project";
    writeSession(root, "proj", "s.jsonl", [
      { type: "user", sessionId: "s", cwd: project, isMeta: true,
        message: { role: "user", content: "<system-reminder>internal noise</system-reminder>" } },
      { type: "user", sessionId: "s", cwd: project, isSidechain: true,
        message: { role: "user", content: "subagent chatter" } },
      { type: "user", sessionId: "s", cwd: project,
        message: { role: "user", content: "the real question" } },
      { type: "assistant", sessionId: "s", cwd: project,
        message: { role: "assistant", model: "claude-test-1", content: [{ type: "text", text: "the real answer" }] } },
    ]);

    const sess = reader.latest(project, { limit: 40 });
    assert.equal(sess.messages.length, 2);
    assert.equal(sess.messages[0].blocks[0].text, "the real question");
    assert.equal(sess.title, "the real question");
  });
});

test("latest() correlates tool_use with its later tool_result", async () => {
  await withFixture(async (root) => {
    const project = "/home/example/tool-project";
    writeSession(root, "proj", "s.jsonl", [
      { type: "user", sessionId: "s", cwd: project,
        message: { role: "user", content: "run a command" } },
      { type: "assistant", sessionId: "s", cwd: project,
        message: {
          role: "assistant",
          model: "claude-test-1",
          content: [{ type: "tool_use", id: "call_1", name: "Bash", input: { command: "echo hi" } }],
        } },
      { type: "user", sessionId: "s", cwd: project,
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "call_1", content: "hi\n" }],
        } },
    ]);

    const sess = reader.latest(project, { limit: 40 });
    const toolBlock = sess.messages.find((m) => m.role === "assistant").blocks[0];
    assert.equal(toolBlock.kind, "tool");
    assert.equal(toolBlock.tool, "Bash");
    assert.equal(toolBlock.result, "hi\n");
  });
});

test("latest() lastUserAt ignores tool_result and meta user rows", async () => {
  await withFixture(async (root) => {
    const project = "/home/example/last-user-project";
    writeSession(root, "proj", "s.jsonl", [
      {
        type: "user",
        sessionId: "s",
        cwd: project,
        timestamp: "2026-06-01T12:00:00.000Z",
        message: { role: "user", content: "the real human turn" },
      },
      {
        type: "assistant",
        sessionId: "s",
        cwd: project,
        timestamp: "2026-06-01T12:00:01.000Z",
        message: {
          role: "assistant",
          model: "claude-test-1",
          content: [{ type: "tool_use", id: "call_1", name: "Bash", input: { command: "echo hi" } }],
        },
      },
      {
        type: "user",
        sessionId: "s",
        cwd: project,
        timestamp: "2026-06-01T14:00:00.000Z",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "call_1", content: "hi\n" }],
        },
      },
      {
        type: "assistant",
        sessionId: "s",
        cwd: project,
        timestamp: "2026-06-01T14:00:01.000Z",
        message: {
          role: "assistant",
          model: "claude-test-1",
          content: [{ type: "text", text: "done" }],
        },
      },
    ]);

    const sess = reader.latest(project, { limit: 40 });
    assert.equal(sess.lastUserAt, Date.parse("2026-06-01T12:00:00.000Z"));
    // tool_result user row must not appear as its own conversation turn
    assert.equal(sess.messages.filter((m) => m.role === "user").length, 1);
  });
});

test("latest() returns null when no session matches the project", async () => {
  await withFixture(async (root) => {
    writeSession(root, "proj", "s.jsonl", [
      { type: "user", sessionId: "s", cwd: "/some/other/project",
        message: { role: "user", content: "unrelated" } },
    ]);
    const sess = reader.latest("/home/example/no-match-project", { limit: 40 });
    assert.equal(sess, null);
  });
});
