// Fast, targeted reader for Cursor agent sessions.
//
// Cursor stores agent transcripts as:
//   ~/.cursor/projects/<project-slug>/agent-transcripts/<uuid>/<uuid>.jsonl
// The slug is the project path with the drive letter lowercased and every run of
// non-alphanumeric characters replaced by "-". Each JSONL line has the shape
//   { role: "user"|"assistant", message: { content: [ {type:"text",text} | {type:"tool_use",name,input} ] } }
//
// Important caveat: Cursor's local JSONL does NOT persist tool results or
// thinking/reasoning blocks — only `text` and `tool_use` items appear in
// content arrays. Tool outputs are materialized server-side at request time
// and never written to disk. That means we can reconstruct the *actions* the
// previous agent took, but not the raw *observations* it received. This is a
// fundamental limitation of the Cursor store, not something we choose to drop.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import { basename, join, resolve } from "node:path";

export const SOURCE = "cursor";
export const DISPLAY = "Cursor";

export function projectsRoot() {
  if (process.env.STEAL_CURSOR_PROJECTS) return process.env.STEAL_CURSOR_PROJECTS;
  return join(os.homedir(), ".cursor", "projects");
}

export function available() {
  return existsSync(projectsRoot());
}

export function slugFor(project) {
  const p = resolve(project);
  // Lowercase only the drive letter (e.g. "C:" -> "c"), strip the colon.
  let s = p;
  if (/^[A-Za-z]:/.test(s)) s = s[0].toLowerCase() + s.slice(2);
  return s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function findProjectDir(project) {
  const root = projectsRoot();
  if (!existsSync(root)) return null;
  const want = slugFor(project).toLowerCase();
  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  // exact (case-insensitive) match first, then a lenient contains match
  let hit = dirs.find((d) => d.toLowerCase() === want);
  if (!hit) hit = dirs.find((d) => d.toLowerCase().replace(/-+/g, "-") === want);
  return hit ? join(root, hit) : null;
}

// newest <uuid>.jsonl under <projectDir>/agent-transcripts
function newestTranscript(projectDir) {
  const tdir = join(projectDir, "agent-transcripts");
  if (!existsSync(tdir)) return null;
  let best = null;
  for (const d of readdirSync(tdir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const file = join(tdir, d.name, `${d.name}.jsonl`);
    if (!existsSync(file)) continue;
    const mtime = statSync(file).mtimeMs;
    if (!best || mtime > best.mtime) best = { file, id: d.name, mtime };
  }
  return best;
}

function cleanUserText(text) {
  if (!text) return "";
  const m = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
  return (m ? m[1] : text).trim();
}

function blocksFromContent(content, role) {
  const blocks = [];
  if (!Array.isArray(content)) return blocks;
  for (const c of content) {
    if (c.type === "text" && c.text) {
      const text = role === "user" ? cleanUserText(c.text) : c.text;
      if (text) blocks.push({ kind: "text", text });
    } else if (c.type === "tool_use") {
      blocks.push({ kind: "tool", tool: c.name, callId: c.id || null, input: c.input });
    }
    // Cursor's JSONL never contains tool_result or thinking blocks
    // (see the module header). There is nothing else to extract here.
  }
  return blocks;
}

// Returns a normalized session for the latest Cursor transcript in `project`, or null.
export function latest(project, { limit = 40 } = {}) {
  const projectDir = findProjectDir(project);
  if (!projectDir) return null;
  const t = newestTranscript(projectDir);
  if (!t) return null;

  const lines = readFileSync(t.file, "utf8").split(/\r?\n/).filter(Boolean);
  const messages = [];
  let title = "";
  for (const line of lines) {
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (!o.role || !o.message) continue;
    const blocks = blocksFromContent(o.message.content, o.role);
    if (!blocks.length) continue;
    if (!title && o.role === "user") {
      const firstText = blocks.find((b) => b.kind === "text");
      if (firstText) title = firstText.text.slice(0, 80).replace(/\s+/g, " ");
    }
    messages.push({ role: o.role, ts: null, blocks });
  }

  const trimmed = messages.slice(-Math.max(1, Math.min(limit, 500)));

  return {
    source: SOURCE,
    display: DISPLAY,
    id: t.id,
    title: title || basename(projectDir),
    model: "cursor-agent",
    updatedAt: t.mtime,
    directory: project,
    originalPath: t.file,
    messages: trimmed,
  };
}
