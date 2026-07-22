// Fast, targeted reader for Claude Code session transcripts.
//
// Claude Code stores per-project session transcripts as:
//   ~/.claude/projects/<project-slug>/<session-id>.jsonl
// Each line is a JSON record (`type`: "user" | "assistant" | "system" |
// "queue-operation" | ...). Every real conversation record also carries a
// `cwd` field with the absolute working directory the session was run from.
//
// We match sessions to a project by that `cwd` field rather than
// reverse-engineering the slug Claude Code derives from the project path for
// the directory name. The slugging scheme is an internal implementation
// detail that has already changed shape across platforms/versions; `cwd` is
// a stable, per-record fact we can match on directly, which keeps this
// reader correct for every user regardless of OS or Claude Code version.
//
// Unlike Cursor's on-disk transcript, Claude Code's JSONL retains full
// local fidelity: `tool_result` blocks (the exact output the previous agent
// saw) and `thinking` blocks are both present, so we surface both, matching
// Kilo Code's richer normalized shape.

import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import os from "node:os";
import { basename, join, resolve } from "node:path";

export const SOURCE = "claude-code";
export const DISPLAY = "Claude Code";

export function projectsRoot() {
  if (process.env.STEAL_CLAUDE_PROJECTS) return process.env.STEAL_CLAUDE_PROJECTS;
  return join(os.homedir(), ".claude", "projects");
}

export function available() {
  return existsSync(projectsRoot());
}

function normPath(p) {
  if (!p) return "";
  let out = resolve(p).replace(/\\/g, "/");
  if (process.platform === "win32") out = out.toLowerCase();
  return out.replace(/\/+$/, "");
}

// Peek at just the first chunk of a JSONL file to find the first record with
// a `cwd` field, without reading the whole (potentially large) file.
function peekCwd(file, maxBytes = 65536) {
  let fd;
  try {
    fd = openSync(file, "r");
    const buf = Buffer.alloc(maxBytes);
    const bytesRead = readSync(fd, buf, 0, maxBytes, 0);
    const text = buf.toString("utf8", 0, bytesRead);
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        continue; // possibly a line truncated by the byte cap — keep scanning
      }
      if (o && typeof o.cwd === "string") return o.cwd;
    }
  } catch {
    /* unreadable file — treat as no match */
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return null;
}

function listSessionFiles() {
  const root = projectsRoot();
  if (!existsSync(root)) return [];
  const files = [];
  for (const projectDir of readdirSync(root, { withFileTypes: true })) {
    if (!projectDir.isDirectory()) continue;
    const dir = join(root, projectDir.name);
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".jsonl")) files.push(join(dir, e.name));
    }
  }
  return files;
}

// Find the newest session file whose `cwd` matches `project`.
function newestMatchingSession(project) {
  const target = normPath(project);
  let best = null;
  for (const file of listSessionFiles()) {
    if (normPath(peekCwd(file)) !== target) continue;
    const mtime = statSync(file).mtimeMs;
    if (!best || mtime > best.mtime) best = { file, mtime };
  }
  return best;
}

function textFromToolResultContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && c.type === "text" ? c.text : c && c.type === "image" ? "[image]" : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function toMs(ts) {
  if (ts == null) return null;
  if (typeof ts === "number" && Number.isFinite(ts) && ts > 0) return ts;
  const n = Date.parse(String(ts));
  return Number.isFinite(n) ? n : null;
}

// Claude Code records tool results as `type:"user"` messages. Those are not
// human turns — `--from auto` must ignore them when ranking recency.
function isToolResultContent(content) {
  return Array.isArray(content) && content.some((c) => c && c.type === "tool_result");
}

function isRealHumanUserRecord(o) {
  if (!o || o.type !== "user" || o.isMeta || o.isSidechain) return false;
  const content = o.message && o.message.content;
  if (isToolResultContent(content)) return false;
  // A human turn has either a string body or at least one text block.
  if (typeof content === "string") return content.trim().length > 0;
  if (Array.isArray(content)) return content.some((c) => c && c.type === "text" && c.text);
  return false;
}

// Returns a normalized session for the latest Claude Code transcript in
// `project`, or null.
export function latest(project, { limit = 40 } = {}) {
  const hit = newestMatchingSession(project);
  if (!hit) return null;

  const lines = readFileSync(hit.file, "utf8").split(/\r?\n/).filter(Boolean);

  const messages = [];
  const toolBlockById = new Map();
  let title = "";
  let sessionId = null;
  let model = null;
  let lastUserAt = null;

  for (const line of lines) {
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.isSidechain) continue; // subagent transcript, not the main thread
    if (o.type !== "user" && o.type !== "assistant") continue;
    if (o.type === "user" && o.isMeta) continue; // system-injected wrapper, not a real human turn

    sessionId = o.sessionId || sessionId;
    const msg = o.message || {};
    const role = msg.role === "user" || msg.role === "assistant" ? msg.role : o.type;
    if (msg.model) model = msg.model;
    const content = msg.content;

    // Track last *human* turn even when we later skip emitting the record
    // (e.g. empty content) — ranking cares about the turn existing.
    if (isRealHumanUserRecord(o)) {
      const ms = toMs(o.timestamp);
      if (ms != null) lastUserAt = ms;
    }

    // Tool-result "user" rows are only used to attach outputs to prior
    // tool_use blocks; they are not conversation turns of their own.
    if (o.type === "user" && isToolResultContent(content)) {
      if (Array.isArray(content)) {
        for (const c of content) {
          if (!c || c.type !== "tool_result") continue;
          const text = textFromToolResultContent(c.content);
          const target = c.tool_use_id ? toolBlockById.get(c.tool_use_id) : null;
          if (target) {
            if (text) target.result = text;
            if (c.is_error) target.status = "error";
          }
        }
      }
      continue;
    }

    const blocks = [];
    if (typeof content === "string") {
      if (content.trim()) blocks.push({ kind: "text", text: content });
    } else if (Array.isArray(content)) {
      for (const c of content) {
        if (!c || typeof c !== "object") continue;
        if (c.type === "text" && c.text) {
          blocks.push({ kind: "text", text: c.text });
        } else if (c.type === "thinking" && c.thinking) {
          blocks.push({ kind: "reasoning", text: c.thinking });
        } else if (c.type === "tool_use") {
          const block = { kind: "tool", tool: c.name, callId: c.id || null, input: c.input };
          blocks.push(block);
          if (c.id) toolBlockById.set(c.id, block);
        } else if (c.type === "tool_result") {
          const text = textFromToolResultContent(c.content);
          const target = c.tool_use_id ? toolBlockById.get(c.tool_use_id) : null;
          if (target) {
            if (text) target.result = text;
            if (c.is_error) target.status = "error";
          }
          // Can't correlate to a prior tool_use (e.g. it fell outside the
          // window already collected) — drop rather than emit an orphan.
        }
        // image / other block types: intentionally not surfaced.
      }
    }

    if (!blocks.length) continue;
    if (!title && role === "user") {
      const firstText = blocks.find((b) => b.kind === "text");
      if (firstText) title = firstText.text.slice(0, 80).replace(/\s+/g, " ");
    }
    messages.push({ role, ts: o.timestamp || null, blocks });
  }

  const trimmed = messages.slice(-Math.max(1, Math.min(limit, 500)));

  return {
    source: SOURCE,
    display: DISPLAY,
    id: sessionId || basename(hit.file, ".jsonl"),
    title: title || basename(hit.file, ".jsonl"),
    model: model || "claude-code",
    updatedAt: hit.mtime,
    lastUserAt,
    directory: project,
    originalPath: hit.file,
    messages: trimmed,
  };
}
