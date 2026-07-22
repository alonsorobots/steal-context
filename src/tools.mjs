// Registry of the AI coding tools steal-context knows how to bridge.
//
// `source` is the exact slug that `continues` reports for the tool (see
// `steal-context doctor`), and is also the key each direct reader module
// exports as `SOURCE`. `commandDir`/`commandFile` describe where a custom
// slash command lives for that tool, relative to a project root.
//
// This registry is intentionally the single place that knows about specific
// tools. `steal run --from auto` and `steal init` both iterate this object
// rather than hardcoding a tool count or pair, so adding a new tool here
// (plus a reader in `src/readers/`) is enough to make it a full participant
// in auto-selection and command installation — no other file needs to change.

export const TOOLS = {
  cursor: {
    source: "cursor",
    display: "Cursor",
    // Cursor custom commands: `.cursor/commands/<name>.md`, invoked as `/<name>`.
    commandDir: ".cursor/commands",
    commandFile: "steal.md",
    template: "cursor-steal.md",
    verified: true,
  },
  "kilo-code": {
    source: "kilo-code",
    display: "Kilo Code",
    // Kilo custom commands (formerly "workflows"), per
    // https://kilo.ai/docs/customize/workflows: `.kilo/commands/<name>.md`.
    // Invoke as `/<name>` (filename without `.md`).
    commandDir: ".kilo/commands",
    commandFile: "steal.md",
    template: "kilo-steal.md",
    verified: true,
    // Legacy locations Kilo auto-migrated from; we clean these up on install.
    legacyCommandPaths: [".kilocode/workflows/steal.md", ".kilocode/commands/steal.md"],
  },
  "claude-code": {
    source: "claude-code",
    display: "Claude Code",
    // Claude Code custom commands: `.claude/commands/<name>.md`, invoked as
    // `/<name>`. See https://code.claude.com/docs/en/slash-commands.md.
    commandDir: ".claude/commands",
    commandFile: "steal.md",
    template: "claude-code-steal.md",
    verified: true,
  },
};

// Sentinel value for `--from auto`: resolve to the session with the most
// recent human turn among every *other* known, available tool for the
// target project, rather than a single hardcoded source. See
// `resolveAutoFrom` in steal.mjs.
export const AUTO = "auto";

// Short names accepted by `/steal <alias>` and by `resolveTool` / CLI --from.
// Keep short and unambiguous: `c` = cursor, `cc` = claude-code, `k` = kilo-code.
export const TOOL_ALIASES = {
  auto: AUTO,
  kilo: "kilo-code",
  k: "kilo-code",
  kilocode: "kilo-code",
  "kilo-code": "kilo-code",
  claude: "claude-code",
  cc: "claude-code",
  "claude-code": "claude-code",
  cursor: "cursor",
  c: "cursor",
};

export function resolveTool(key) {
  if (!key) return undefined;
  const norm = String(key).toLowerCase().trim();
  if (!norm) return undefined;
  if (norm === AUTO) return { source: AUTO, display: "auto" };
  if (TOOL_ALIASES[norm]) {
    const source = TOOL_ALIASES[norm];
    if (source === AUTO) return { source: AUTO, display: "auto" };
    return TOOLS[source];
  }
  if (TOOLS[norm]) return TOOLS[norm];
  // fuzzy: allow partials like "kilo-cod" — but require length > 1 so a
  // stray letter doesn't match every source that contains it.
  if (norm.length > 1) {
    const hit = Object.values(TOOLS).find(
      (t) => t.source.includes(norm) || norm.includes(t.source),
    );
    if (hit) return hit;
  }
  return undefined;
}

// Resolve the optional `/steal <args>` payload into a `--from` value.
// Returns `{ from, error? }`. Empty → auto.
//
// Note: slash-command hosts substitute `$ARGUMENTS` *everywhere* in the
// template, so templates must mention that token only inside `<source-arg>`
// (never in "if literal $ARGUMENTS → auto" instructions — that rewrites the
// rule into "if literal k → auto" when the user typed `/steal k`).
export function resolveFromArgs(raw) {
  const text = raw == null ? "" : String(raw).trim();
  // Hosts that fail to substitute leave the token intact; treat as empty.
  if (!text || text === "$ARGUMENTS" || text === "${ARGUMENTS}") {
    return { from: AUTO };
  }
  const token = text.split(/\s+/)[0];
  const tool = resolveTool(token);
  if (!tool) {
    const known = [...new Set(Object.keys(TOOL_ALIASES))].sort().join(", ");
    return {
      from: null,
      error: `Unrecognized source "${token}". Use one of: ${known}`,
    };
  }
  return { from: tool.source };
}

// Legacy two-tool default, kept only for `run`/`init` calls that don't pass
// --from/--to at all. New installs use `--from auto`, which considers every
// registered tool instead of just this pair.
export const DEFAULT_FROM = "kilo-code";
export const DEFAULT_TO = "cursor";
