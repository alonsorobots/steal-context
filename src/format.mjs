// Shared formatter: turns a normalized session into a handoff markdown body.
//
// Normalized session shape:
//   { source, display, id, title, model, updatedAt: Date, directory,
//     messages: [ { role, ts: Date|null, blocks: [ {kind, text?, tool?, input?} ] } ] }

// Character budgets per message block, tuned for large-context frontier models
// (Opus 4.8 ~200K tokens, GLM 5.2 ~128K). `verbose` is the default because these
// models comfortably handle it and the extra tool-call detail is where useful
// state actually lives. `standard` is a "quick nudge" option.
export const PRESET_LIMITS = {
  minimal: { msgs: 6, tool: 200, reasoning: 300, text: 4000 },
  standard: { msgs: 16, tool: 500, reasoning: 700, text: 8000 },
  verbose: { msgs: 40, tool: 2000, reasoning: 2000, text: 20000 },
  full: { msgs: Infinity, tool: 8000, reasoning: 4000, text: 60000 },
};

function truncate(s, n) {
  if (s == null) return "";
  s = String(s).replace(/\s+$/g, "");
  if (s.length <= n) return s;
  return s.slice(0, n) + ` … [+${s.length - n} chars]`;
}

function fmtTime(d) {
  if (!d) return "unknown";
  try {
    return new Date(d).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
  } catch {
    return "unknown";
  }
}

function renderBlock(b, lim) {
  switch (b.kind) {
    case "text":
      return truncate(b.text, lim.text);
    case "reasoning":
      return `_[reasoning]_ ${truncate(b.text, lim.reasoning)}`;
    case "tool": {
      const inp =
        b.input != null
          ? truncate(typeof b.input === "string" ? b.input : JSON.stringify(b.input), lim.tool)
          : "";
      return `\`[tool:${b.tool || "?"}]\`${inp ? " " + inp : ""}`;
    }
    default:
      return "";
  }
}

export function renderHandoff(sess, preset = "standard") {
  const lim = PRESET_LIMITS[preset] || PRESET_LIMITS.standard;
  const msgs = lim.msgs === Infinity ? sess.messages : sess.messages.slice(-lim.msgs);
  const omitted = sess.messages.length - msgs.length;

  const out = [];
  out.push("# Session Handoff Context");
  out.push("");
  out.push("| Field | Value |");
  out.push("|-------|-------|");
  out.push(`| **Source** | ${sess.display} |`);
  out.push(`| **Title** | ${sess.title || "(untitled)"} |`);
  out.push(`| **Model** | ${sess.model || "unknown"} |`);
  out.push(`| **Project** | ${sess.directory || "unknown"} |`);
  out.push(`| **Last active** | ${fmtTime(sess.updatedAt)} |`);
  out.push(`| **Session ID** | \`${sess.id}\` |`);
  out.push(`| **Messages shown** | ${msgs.length}${omitted > 0 ? ` (of ${sess.messages.length}; ${omitted} older omitted)` : ""} |`);
  out.push("");
  out.push("## Recent Conversation");
  out.push("");

  for (const m of msgs) {
    const who = m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : m.role;
    const when = m.ts ? ` (${fmtTime(m.ts)})` : "";
    const rendered = m.blocks
      .map((b) => renderBlock(b, lim))
      .filter((s) => s && s.trim())
      .join("\n\n");
    if (!rendered.trim()) continue;
    out.push(`### ${who}${when}`);
    out.push("");
    out.push(rendered);
    out.push("");
  }

  out.push("---");
  out.push(
    `You are continuing this session. Review the conversation above, verify current file state, and pick up where it left off.`,
  );
  return out.join("\n") + "\n";
}
