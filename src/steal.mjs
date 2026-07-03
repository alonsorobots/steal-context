import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { runContinues } from "./continues.mjs";
import { resolveTool } from "./tools.mjs";
import { renderHandoff, renderHandoffJson, PRESET_LIMITS } from "./format.mjs";
import * as kilo from "./readers/kilo.mjs";
import * as cursor from "./readers/cursor.mjs";

export const PRESETS = Object.keys(PRESET_LIMITS);
export const FORMATS = ["markdown", "json"];

// Tools we can read directly (fast path, no global index rebuild).
const DIRECT_READERS = {
  "kilo-code": kilo,
  cursor: cursor,
};

// Large-context frontier models on both sides (Opus 4.8, GLM 5.2, etc.) easily
// handle `verbose`. Users can override with --preset for smaller / larger.
function defaultPresetFor(_toKey) {
  return "verbose";
}

// The banner is a takeover prompt, not a briefing. The receiving model's
// message array only has one user turn (this whole document pasted into a
// chat), so its default self-model is "fresh agent being briefed by a
// human." That produces the "let me catch up…" behavior. To make the
// handoff feel like an in-tool model switch — where prior assistant turns
// occupy the assistant slot and the new model just continues in first
// person — we explicitly instruct the model to treat the transcript as its
// own prior turns and to skip any re-orientation preamble.
function banner({ session, fromTool, toTool, preset, engine }) {
  const model = session.model && session.model !== "unknown" ? ` · model ${session.model}` : "";
  const when = session.updatedAt ? new Date(session.updatedAt).toISOString() : "unknown time";
  return [
    "==================================================================",
    ` RESUMING SESSION — your prior turns from ${fromTool.display}${model}`,
    "==================================================================",
    "",
    "The messages below are YOUR OWN prior turns in this project's session,",
    `exported from ${fromTool.display} so ${toTool.display} can continue them.`,
    "Read them as your own conversation history, not as a briefing from a",
    "different agent.",
    "",
    "Continue in FIRST PERSON, in the same voice, as if you had just said the",
    "last assistant turn yourself. Do NOT say \"I see\", \"let me catch up\",",
    "\"understood\", or otherwise re-orient — just say the next thing you would",
    "say. The user has not spoken again yet; they expect you to pick up where",
    "you left off.",
    "",
    "One thing that MAY HAVE CHANGED since these turns were written is the",
    "file system. Before editing any file, re-read it to verify current state.",
    "",
    `Session "${session.title || session.id}" · last active ${when} · preset "${preset}" · via ${engine}.`,
    "------------------------------------------------------------------",
    "",
  ].join("\n");
}

function presetMsgLimit(preset) {
  const n = (PRESET_LIMITS[preset] || PRESET_LIMITS.standard).msgs;
  return n === Infinity ? 500 : n;
}

// Fast path: read the source tool's store directly.
function stealDirect({ reader, project, preset, format }) {
  const sess = reader.latest(project, { limit: presetMsgLimit(preset) });
  if (!sess) return null;
  const render = format === "json" ? renderHandoffJson : renderHandoff;
  return { session: sess, body: render(sess, preset), engine: "direct reader" };
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

export function steal({ from, to, preset, format, project = process.cwd(), out } = {}) {
  const fromTool = resolveTool(from) || { source: from, display: from };
  const toTool = resolveTool(to) || { source: to || "unknown", display: to || "the current tool" };

  const chosenPreset = preset || defaultPresetFor(toTool.source);
  if (!PRESETS.includes(chosenPreset)) {
    throw new Error(`Invalid preset "${chosenPreset}". Choose one of: ${PRESETS.join(", ")}.`);
  }
  const chosenFormat = format || "markdown";
  if (!FORMATS.includes(chosenFormat)) {
    throw new Error(`Invalid format "${chosenFormat}". Choose one of: ${FORMATS.join(", ")}.`);
  }

  const reader = DIRECT_READERS[fromTool.source];
  let result = null;
  if (reader && reader.available()) {
    result = stealDirect({ reader, project, preset: chosenPreset, format: chosenFormat });
  }
  if (!result) {
    // The `continues` fallback only emits markdown. Warn if the caller asked
    // for JSON on a tool that doesn't have a direct reader — we still return
    // usable output, but it won't be structured.
    result = stealViaContinues({ fromSource: fromTool.source, project, preset: chosenPreset });
    if (chosenFormat === "json" && result) result.engine += " (json unavailable — markdown fallback)";
  }
  if (!result) {
    throw new Error(
      `No ${fromTool.display} sessions found for this project. Have you used ${fromTool.display} here yet?`,
    );
  }

  const defaultExt = chosenFormat === "json" ? "md" : "md"; // still markdown-wrapped
  const outFile = out
    ? resolve(out)
    : join(resolve(project), ".steal", `handoff.${defaultExt}`);
  mkdirSync(dirname(outFile), { recursive: true });
  const head = banner({ session: result.session, fromTool, toTool, preset: chosenPreset, engine: result.engine });
  const text = head + result.body;
  writeFileSync(outFile, text, "utf8");

  return {
    text,
    outFile,
    session: result.session,
    preset: chosenPreset,
    format: chosenFormat,
    fromTool,
    toTool,
    engine: result.engine,
  };
}
