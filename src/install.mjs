import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AUTO, TOOLS, resolveTool } from "./tools.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = resolve(HERE, "..", "templates");

function renderTemplate(name, vars) {
  const raw = readFileSync(join(TEMPLATE_DIR, name), "utf8");
  return raw.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{{${key}}}`,
  );
}

// User-level command dirs (available in every project without per-repo init).
export function globalCommandDirFor(toKey) {
  const tool = resolveTool(toKey);
  if (!tool) return null;
  const home = os.homedir();
  if (tool.source === "cursor") return join(home, ".cursor", "commands");
  if (tool.source === "kilo-code") return join(home, ".config", "kilo", "commands");
  if (tool.source === "claude-code") return join(home, ".claude", "commands");
  return null;
}

function runCommandLine({ runner, fromTool, toTool, preset }) {
  const run = runner || "steal-context";
  // Cursor's own reader can't see tool results/reasoning, so whenever Cursor
  // is the *destination*, ask for JSON — it preserves whatever richer detail
  // the (possibly auto-picked) source has verbatim, rather than the lossier
  // markdown summary.
  const formatFlag = toTool.source === "cursor" ? " --format json" : "";
  return (
    `${run} run --from ${fromTool.source} --to ${toTool.source}` +
    (preset ? ` --preset ${preset}` : "") +
    formatFlag
  );
}

// Installs a `/steal` command into `toTool` that steals from `fromTool`.
// `fromKey` may be a real tool key or the `AUTO` sentinel ("auto"), in which
// case the installed command pulls from whichever *other* known tool had the
// most recent human turn — see `resolveAutoFrom` in steal.mjs. Templates also
// accept `/steal <alias>` via $ARGUMENTS to pin a source.
// Returns the path written.
export function installCommand({
  toKey,
  fromKey,
  preset,
  runner,
  project = process.cwd(),
  commandDirOverride,
  global = false,
  force = false,
}) {
  const toTool = resolveTool(toKey);
  if (!toTool) throw new Error(`Unknown target tool: "${toKey}".`);

  const isAuto = String(fromKey).toLowerCase() === AUTO;
  const fromTool = isAuto
    ? { source: AUTO, display: "the other tool you messaged most recently" }
    : resolveTool(fromKey);
  if (!fromTool) throw new Error(`Unknown source tool: "${fromKey}".`);

  let commandDir;
  if (global) {
    commandDir = globalCommandDirFor(toKey);
    if (!commandDir) {
      throw new Error(`Global slash commands are not configured for "${toKey}".`);
    }
  } else {
    commandDir = resolve(project, commandDirOverride || toTool.commandDir);
  }
  const dest = join(commandDir, toTool.commandFile);

  if (existsSync(dest) && !force) {
    return { dest, skipped: true, global };
  }

  const content = renderTemplate(toTool.template, {
    FROM: fromTool.source,
    FROM_DISPLAY: fromTool.display,
    TO: toTool.source,
    TO_DISPLAY: toTool.display,
    RUNNER: runner || "steal-context",
    COMMAND: runCommandLine({ runner, fromTool, toTool, preset }),
  });

  mkdirSync(commandDir, { recursive: true });
  writeFileSync(dest, content, "utf8");

  // Clean up any legacy project locations (e.g. .kilocode/workflows/steal.md).
  const removed = [];
  if (!global) {
    for (const legacy of toTool.legacyCommandPaths || []) {
      const p = resolve(project, legacy);
      if (existsSync(p) && p !== dest) {
        try {
          unlinkSync(p);
          removed.push(p);
        } catch {
          /* best effort */
        }
      }
    }
  }
  return { dest, skipped: false, verified: toTool.verified, removedLegacy: removed, global };
}

// Installs `/steal --from auto` into every tool in `tools` (default: every
// tool in the registry). This is what makes the bridge N-way: each
// installed command doesn't hardcode a partner, so adding a new tool to
// `TOOLS` (plus a reader) automatically makes it reachable by every
// already-installed `/steal` command too, with no reinstall required.
export function installAllCommands({
  tools = Object.keys(TOOLS),
  preset,
  runner,
  project,
  force,
  global = false,
} = {}) {
  return tools.map((toKey) =>
    installCommand({ toKey, fromKey: AUTO, preset, runner, project, force, global }),
  );
}

// Legacy explicit two-tool install (kept for `--a`/`--b`). Prefer
// `installAllCommands` (the default): it scales to any number of tools.
export function installBridge({ a, b, preset, runner, project, force, global = false }) {
  const results = [];
  results.push(installCommand({ toKey: a, fromKey: b, preset, runner, project, force, global }));
  results.push(installCommand({ toKey: b, fromKey: a, preset, runner, project, force, global }));
  return results;
}
