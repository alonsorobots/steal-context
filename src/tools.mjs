// Registry of the AI coding tools steal-context knows how to bridge.
//
// `source` is the exact slug that `continues` reports for the tool (see
// `steal-context doctor`). `commandDir`/`commandFile` describe where a custom
// slash command lives for that tool, relative to a project root.

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
  claude: {
    source: "claude",
    display: "Claude Code",
    // Claude Code custom commands: `.claude/commands/<name>.md`, invoked as `/<name>`.
    commandDir: ".claude/commands",
    commandFile: "steal.md",
    template: "claude-steal.md",
    verified: true,
  },
  codex: {
    source: "codex",
    display: "Codex",
    // Codex custom prompts live in the user Codex home and are invoked as
    // `/prompts:<name>`. Repo-local Codex workflows should use skills instead.
    commandDir: ".codex/prompts",
    commandFile: "steal.md",
    template: "codex-steal.md",
    verified: true,
    localSupported: false,
  },
};

export function resolveTool(key) {
  if (!key) return undefined;
  const norm = String(key).toLowerCase().trim();
  if (TOOLS[norm]) return TOOLS[norm];
  // fuzzy: allow "kilo" -> "kilo-code", etc.
  const hit = Object.values(TOOLS).find(
    (t) => t.source.includes(norm) || norm.includes(t.source),
  );
  return hit;
}

// The default bridge: the two tools this session is set up to move between.
export const DEFAULT_FROM = "kilo-code";
export const DEFAULT_TO = "cursor";
