import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { runContinues } from "./continues.mjs";
import { resolveTool } from "./tools.mjs";
import { renderHandoff, PRESET_LIMITS } from "./format.mjs";
import * as kilo from "./readers/kilo.mjs";
import * as cursor from "./readers/cursor.mjs";

export const PRESETS = Object.keys(PRESET_LIMITS);

// Tools we can read directly (fast path, no global index rebuild).
const DIRECT_READERS = {
  "kilo-code": kilo,
  cursor: cursor,
};

function defaultPresetFor(toKey) {
  switch (toKey) {
    case "cursor":
      return "standard";
    case "kilo-code":
      return "verbose";
    default:
      return "standard";
  }
}

function banner({ session, fromTool, toTool, preset, engine }) {
  const model = session.model && session.model !== "unknown" ? ` (model: ${session.model})` : "";
  const when = session.updatedAt ? new Date(session.updatedAt).toISOString() : "unknown time";
  return [
    "==================================================================",
    ` STOLEN CONTEXT — from your latest ${fromTool.display}${model} chat`,
    "==================================================================",
    "",
    `You are ${toTool.display}. The block below was extracted from a DIFFERENT`,
    `AI coding tool — ${fromTool.display} — for this project.`,
    `Session "${session.title || session.id}" · last active ${when} · preset "${preset}" · via ${engine}.`,
    "",
    "Treat it as HISTORICAL context, not ground truth: files may have changed",
    "since. Verify current file state before acting, preserve the user's stated",
    "intent and decisions, and continue the task from where it left off.",
    "------------------------------------------------------------------",
    "",
  ].join("\n");
}

function presetMsgLimit(preset) {
  const n = (PRESET_LIMITS[preset] || PRESET_LIMITS.standard).msgs;
  return n === Infinity ? 500 : n;
}

// Fast path: read the source tool's store directly.
function stealDirect({ reader, project, preset }) {
  const sess = reader.latest(project, { limit: presetMsgLimit(preset) });
  if (!sess) return null;
  return { session: sess, body: renderHandoff(sess, preset), engine: "direct reader" };
}

// Fallback: use the `continues` engine (any of its 16 tools).
function stealViaContinues({ fromSource, project, preset }) {
  const list = runContinues(["list", "--source", fromSource, "--json", "-n", "50"]);
  if (list.status !== 0) {
    const err = (list.stderr || list.stdout || "").trim();
    throw new Error(`\`continues list --source ${fromSource}\` failed (exit ${list.status}).${err ? "\n" + err : ""}`);
  }
  let sessions;
  try {
    sessions = JSON.parse(list.stdout || "[]");
  } catch {
    throw new Error("Could not parse `continues list` JSON output.");
  }
  if (!Array.isArray(sessions) || !sessions.length) return null;

  const norm = (p) => (p ? resolve(p).replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "") : "");
  const target = norm(project);
  const inProject = sessions.filter((s) => norm(s.repo) === target || norm(s.cwd) === target);
  const pool = inProject.length ? inProject : sessions;
  pool.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  const chosen = pool[0];

  const tmp = join(resolve(project), ".steal", `_continues_${chosen.id}.md`);
  mkdirSync(dirname(tmp), { recursive: true });
  const insp = runContinues(["inspect", chosen.id, "--preset", preset, "--write-md", tmp]);
  if (insp.status !== 0) {
    const err = (insp.stderr || insp.stdout || "").trim();
    throw new Error(`\`continues inspect ${chosen.id}\` failed (exit ${insp.status}).${err ? "\n" + err : ""}`);
  }
  const body = readFileSync(tmp, "utf8");
  const session = {
    title: chosen.summary || chosen.id,
    id: chosen.id,
    model: chosen.model || "unknown",
    updatedAt: chosen.updatedAt || chosen.createdAt,
  };
  return { session, body, engine: "continues" };
}

export function steal({ from, to, preset, project = process.cwd(), out } = {}) {
  const fromTool = resolveTool(from) || { source: from, display: from };
  const toTool = resolveTool(to) || { source: to || "unknown", display: to || "the current tool" };

  const chosenPreset = preset || defaultPresetFor(toTool.source);
  if (!PRESETS.includes(chosenPreset)) {
    throw new Error(`Invalid preset "${chosenPreset}". Choose one of: ${PRESETS.join(", ")}.`);
  }

  const reader = DIRECT_READERS[fromTool.source];
  let result = null;
  if (reader && reader.available()) {
    result = stealDirect({ reader, project, preset: chosenPreset });
  }
  if (!result) {
    result = stealViaContinues({ fromSource: fromTool.source, project, preset: chosenPreset });
  }
  if (!result) {
    throw new Error(
      `No ${fromTool.display} sessions found for this project. Have you used ${fromTool.display} here yet?`,
    );
  }

  const outFile = out ? resolve(out) : join(resolve(project), ".steal", "handoff.md");
  mkdirSync(dirname(outFile), { recursive: true });
  const head = banner({ session: result.session, fromTool, toTool, preset: chosenPreset, engine: result.engine });
  const text = head + result.body;
  writeFileSync(outFile, text, "utf8");

  return { text, outFile, session: result.session, preset: chosenPreset, fromTool, toTool, engine: result.engine };
}
