import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

// Installs a `/steal` command into `toTool` that steals from `fromTool`.
// Returns the path written.
export function installCommand({ toKey, fromKey, preset, runner, project = process.cwd(), commandDirOverride, force = false }) {
  const toTool = resolveTool(toKey);
  const fromTool = resolveTool(fromKey);
  if (!toTool) throw new Error(`Unknown target tool: "${toKey}".`);
  if (!fromTool) throw new Error(`Unknown source tool: "${fromKey}".`);

  const commandDir = resolve(project, commandDirOverride || toTool.commandDir);
  const dest = join(commandDir, toTool.commandFile);

  if (existsSync(dest) && !force) {
    return { dest, skipped: true };
  }

  const run = runner || "steal-context";
  const command =
    `${run} run --from ${fromTool.source} --to ${toTool.source}` +
    (preset ? ` --preset ${preset}` : "");

  const content = renderTemplate(toTool.template, {
    FROM: fromTool.source,
    FROM_DISPLAY: fromTool.display,
    TO: toTool.source,
    TO_DISPLAY: toTool.display,
    COMMAND: command,
  });

  mkdirSync(commandDir, { recursive: true });
  writeFileSync(dest, content, "utf8");
  return { dest, skipped: false, verified: toTool.verified };
}

// Installs both directions of a bridge between two tools.
export function installBridge({ a, b, preset, runner, project, force }) {
  const results = [];
  results.push(installCommand({ toKey: a, fromKey: b, preset, runner, project, force }));
  results.push(installCommand({ toKey: b, fromKey: a, preset, runner, project, force }));
  return results;
}
