import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTool } from "./tools.mjs";

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
  return null;
}

function runCommandLine({ runner, fromTool, toTool, preset }) {
  const run = runner || "steal-context";
  // Cursor receives Kilo sessions — JSON preserves tool results verbatim.
  const formatFlag = toTool.source === "cursor" ? " --format json" : "";
  return (
    `${run} run --from ${fromTool.source} --to ${toTool.source}` +
    (preset ? ` --preset ${preset}` : "") +
    formatFlag
  );
}

// Installs a `/steal` command into `toTool` that steals from `fromTool`.
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
  const fromTool = resolveTool(fromKey);
  if (!toTool) throw new Error(`Unknown target tool: "${toKey}".`);
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

// Installs both directions of a bridge between two tools.
export function installBridge({ a, b, preset, runner, project, force, global = false }) {
  const results = [];
  results.push(installCommand({ toKey: a, fromKey: b, preset, runner, project, force, global }));
  results.push(installCommand({ toKey: b, fromKey: a, preset, runner, project, force, global }));
  return results;
}
