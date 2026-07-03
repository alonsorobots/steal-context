// Shared formatter: turns a normalized session into a handoff document.
//
// Normalized session shape:
//   { source, display, id, title, model, updatedAt, directory,
//     messages: [ { role, ts, blocks: [
//         {kind:"text", text}
//       | {kind:"reasoning", text}
//       | {kind:"tool", tool, callId?, input, status?, result?, resultMeta?}
//     ] } ] }
//
// Two output formats are supported:
//   - "markdown" (default) — human-readable, well-suited to paste-into-chat.
//   - "json" — a fenced code block containing the normalized session, giving
//     the receiving model the highest-fidelity view of what the previous
//     agent actually saw (verbatim tool inputs/outputs, preserved ordering).

// Character budgets per block kind, tuned for large-context frontier models
// (Opus 4.8 ~200K tokens, GLM 5.2 ~128K). `verbose` is the default because
// these models comfortably handle it and the extra tool-output detail is
// where the useful state actually lives.
export const PRESET_LIMITS = {
  minimal: { msgs: 6, tool: 200, result: 500, reasoning: 300, text: 4000 },
  standard: { msgs: 16, tool: 500, result: 1500, reasoning: 700, text: 8000 },
  verbose: { msgs: 40, tool: 2000, result: 5000, reasoning: 2000, text: 20000 },
  full: { msgs: Infinity, tool: 8000, result: 20000, reasoning: 4000, text: 60000 },
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

function stringifyInput(v) {
  if (v == null) return "";
  return typeof v === "string" ? v : JSON.stringify(v);
}

function renderBlock(b, lim) {
  switch (b.kind) {
    case "text":
      return truncate(b.text, lim.text);
    case "reasoning":
      return `_[reasoning]_ ${truncate(b.text, lim.reasoning)}`;
    case "tool": {
      const parts = [];
      const head = `\`[tool:${b.tool || "?"}${b.status && b.status !== "completed" ? ` · ${b.status}` : ""}]\``;
      const inp = truncate(stringifyInput(b.input), lim.tool);
      parts.push(inp ? `${head} ${inp}` : head);
      if (b.result != null && String(b.result).length) {
        parts.push(`_↳ result:_ ${truncate(stringifyInput(b.result), lim.result)}`);
      }
      if (b.resultMeta && b.resultMeta.diff) {
        parts.push("```diff\n" + truncate(b.resultMeta.diff, lim.result) + "\n```");
      }
      return parts.join("\n");
    }
    default:
      return "";
  }
}

function sessionHeaderRows(sess, shown, omitted) {
  const rows = [
    `| **Source** | ${sess.display} |`,
    `| **Title** | ${sess.title || "(untitled)"} |`,
    `| **Model** | ${sess.model || "unknown"} |`,
    `| **Project** | ${sess.directory || "unknown"} |`,
    `| **Last active** | ${fmtTime(sess.updatedAt)} |`,
    `| **Session ID** | \`${sess.id}\` |`,
    `| **Messages shown** | ${shown}${omitted > 0 ? ` (of ${shown + omitted}; ${omitted} older omitted)` : ""} |`,
  ];
  return ["| Field | Value |", "|-------|-------|", ...rows];
}

export function renderHandoff(sess, preset = "standard") {
  const lim = PRESET_LIMITS[preset] || PRESET_LIMITS.standard;
  const msgs = lim.msgs === Infinity ? sess.messages : sess.messages.slice(-lim.msgs);
  const omitted = sess.messages.length - msgs.length;

  const out = [];
  out.push("# Prior Turns In This Session");
  out.push("");
  out.push(...sessionHeaderRows(sess, msgs.length, omitted));
  out.push("");
  out.push(
    "> `User` turns below are the human. `Assistant` turns are **you** —",
    "> your own prior words, tool calls, and results. Read them as your own",
    "> conversation history and continue from the last assistant turn.",
  );
  out.push("");
  out.push("---");
  out.push("");

  for (const m of msgs) {
    const who = m.role === "user" ? "User" : m.role === "assistant" ? "Assistant (you)" : m.role;
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
    `End of prior turns. Continue from here in first person, without any "let me catch up" preamble — just say the next thing.`,
  );
  return out.join("\n") + "\n";
}

// High-fidelity handoff: emit the normalized session as JSON in a fenced code
// block, preceded by a short instruction so the receiving model knows how to
// consume it. Content blocks retain their exact shape (including `tool_use`
// paired with a `result` field for Kilo), which lets the model reconstruct
// what the previous agent actually observed rather than a summarized retell.
export function renderHandoffJson(sess, preset = "standard") {
  const lim = PRESET_LIMITS[preset] || PRESET_LIMITS.standard;
  const msgs = lim.msgs === Infinity ? sess.messages : sess.messages.slice(-lim.msgs);
  const omitted = sess.messages.length - msgs.length;

  const trimBlock = (b) => {
    switch (b.kind) {
      case "text":
        return { kind: "text", text: truncate(b.text, lim.text) };
      case "reasoning":
        return { kind: "reasoning", text: truncate(b.text, lim.reasoning) };
      case "tool": {
        const out = { kind: "tool", tool: b.tool };
        if (b.callId) out.callId = b.callId;
        if (b.status) out.status = b.status;
        // Tool inputs are usually small JSON — preserve verbatim up to the
        // `tool` budget rather than stringifying-then-truncating so the
        // receiving model still gets structured fields.
        if (b.input !== undefined) {
          const s = stringifyInput(b.input);
          out.input = s.length > lim.tool ? truncate(s, lim.tool) : b.input;
        }
        if (b.result != null) {
          const s = stringifyInput(b.result);
          out.result = s.length > lim.result ? truncate(s, lim.result) : b.result;
        }
        if (b.resultMeta && b.resultMeta.diff) {
          out.resultMeta = { diff: truncate(b.resultMeta.diff, lim.result) };
          if (b.resultMeta.truncated) out.resultMeta.truncated = true;
        }
        return out;
      }
      default:
        return null;
    }
  };

  const trimmedMessages = msgs.map((m) => ({
    role: m.role,
    ts: m.ts || null,
    blocks: m.blocks.map(trimBlock).filter(Boolean),
  }));

  const payload = {
    source: sess.source,
    display: sess.display,
    id: sess.id,
    title: sess.title || null,
    model: sess.model || null,
    directory: sess.directory || null,
    updatedAt: sess.updatedAt || null,
    messages: trimmedMessages,
  };

  const out = [];
  out.push("# Prior Turns In This Session (structured)");
  out.push("");
  out.push(...sessionHeaderRows(sess, trimmedMessages.length, omitted));
  out.push("");
  out.push(
    "Below is YOUR OWN prior message history in this session, in normalized",
    "Anthropic-style content-block form. `assistant` entries are your own",
    "prior turns; each `tool` block records what you invoked and `result`",
    "(when present) is the exact output you received. Continue in first",
    "person from the last assistant turn — do not re-orient, do not say",
    '"let me catch up", just say the next thing. Re-read any file before',
    "editing it since the file system may have changed since these turns.",
  );
  out.push("");
  out.push("```json");
  out.push(JSON.stringify(payload, null, 2));
  out.push("```");
  out.push("");
  return out.join("\n");
}
