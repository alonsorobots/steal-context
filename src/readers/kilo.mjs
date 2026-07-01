// Fast, targeted reader for Kilo Code sessions.
//
// Kilo (v5+) stores everything in a single SQLite DB (OpenCode-style schema):
//   session(id, directory, title, model[JSON], time_created, time_updated, ...)
//   message(id, session_id, time_created, data[JSON: role, ...])
//   part(id, message_id, session_id, time_created, data[JSON: type, text, tool, ...])
//
// We query by indexed columns only (no full scan), so it's ~instant regardless
// of DB size.

import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import os from "node:os";
import { join, resolve } from "node:path";

export const SOURCE = "kilo-code";
export const DISPLAY = "Kilo Code";

export function dbPath() {
  if (process.env.STEAL_KILO_DB) return process.env.STEAL_KILO_DB;
  return join(os.homedir(), ".local", "share", "kilo", "kilo.db");
}

export function available() {
  return existsSync(dbPath());
}

function normPath(p) {
  if (!p) return "";
  let out = resolve(p).replace(/\\/g, "/");
  if (process.platform === "win32") out = out.toLowerCase();
  return out.replace(/\/+$/, "");
}

function parseModel(raw) {
  if (!raw) return "unknown";
  try {
    const m = JSON.parse(raw);
    if (m && m.id) return m.providerID ? `${m.id} (${m.providerID})` : m.id;
  } catch {
    /* not JSON */
  }
  return String(raw);
}

// Returns a normalized session for the latest Kilo session in `project`, or null.
export function latest(project, { limit = 40 } = {}) {
  const path = dbPath();
  if (!existsSync(path)) return null;
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const target = normPath(project);
    const rows = db
      .prepare(
        "SELECT id, directory, title, model, time_created, time_updated FROM session ORDER BY time_updated DESC LIMIT 300",
      )
      .all();
    const match = rows.find((r) => normPath(r.directory) === target) || null;
    if (!match) return null;

    const msgRows = db
      .prepare(
        "SELECT id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created DESC LIMIT ?",
      )
      .all(match.id, Math.max(1, Math.min(limit, 500)));
    msgRows.reverse();

    const partStmt = db.prepare(
      "SELECT data FROM part WHERE message_id = ? ORDER BY time_created ASC",
    );

    const messages = [];
    for (const mr of msgRows) {
      let md = {};
      try {
        md = JSON.parse(mr.data);
      } catch {
        /* skip */
      }
      const role = md.role || "assistant";
      const blocks = [];
      for (const pr of partStmt.all(mr.id)) {
        let pd;
        try {
          pd = JSON.parse(pr.data);
        } catch {
          continue;
        }
        if (pd.type === "reasoning" && pd.text) blocks.push({ kind: "reasoning", text: pd.text });
        else if (pd.type === "text" && pd.text) blocks.push({ kind: "text", text: pd.text });
        else if (pd.type === "tool")
          blocks.push({ kind: "tool", tool: pd.tool, input: pd.state && pd.state.input });
      }
      if (blocks.length) messages.push({ role, ts: mr.time_created, blocks });
    }

    return {
      source: SOURCE,
      display: DISPLAY,
      id: match.id,
      title: match.title,
      model: parseModel(match.model),
      updatedAt: match.time_updated,
      directory: match.directory,
      originalPath: path,
      messages,
    };
  } finally {
    db.close();
  }
}
