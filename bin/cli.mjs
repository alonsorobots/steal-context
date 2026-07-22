#!/usr/bin/env node
// Quiet the node:sqlite "ExperimentalWarning" (we use it deliberately, read-only).
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w && w.name === "ExperimentalWarning" && /SQLite/i.test(w.message)) return;
  process.emitWarning(w);
});

import { runContinues, hasLocalContinues, CONTINUES_VERSION } from "../src/continues.mjs";
import { steal, PRESETS, FORMATS } from "../src/steal.mjs";
import { installAllCommands, installBridge } from "../src/install.mjs";
import { AUTO, DEFAULT_FROM, DEFAULT_TO, TOOLS } from "../src/tools.mjs";

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

const HELP = `steal-context — pull chat context from your OTHER AI coding tool(s).

In-chat (after install):
  /steal                 auto — other tool you messaged most recently on this project
  /steal kilo|k          force Kilo Code
  /steal claude|cc       force Claude Code
  /steal cursor|c        force Cursor

CLI:
  steal-context run   [--from <tool>|auto] [--to <tool>] [--preset <p>] [--format <f>] [--project <dir>] [--out <file>]
  steal-context init  [--only <tool1,tool2,...>] [--a <tool> --b <tool>] [--preset <p>] [--runner <cmd>] [--local] [--force]
  steal-context doctor
  steal-context help

Commands:
  run     Extract the most recent <from> session (scoped to the project) and print a
          resume banner + handoff document to stdout. Also writes .steal/handoff.md.
          --from auto ranks by last human turn (not agent store mtime).
  init    Install /steal slash commands (default: global — all projects, all known
          tools). Pass --only cursor,claude-code to limit which tools. Pass --force
          after upgrades to refresh templates. Pass --local for the current repo.
          Global install also runs on "npm install -g steal-context".
  doctor  Show detected tools/slugs (via 'continues scan') and environment checks.

Presets (context budget): ${PRESETS.join(", ")}
Formats:                  ${FORMATS.join(", ")}  (json = structured content-block dump; markdown = human-readable)
Known tools:              ${Object.keys(TOOLS).join(", ")}  (--from ${AUTO} picks among whichever of these are installed)
Aliases:                  kilo|k, claude|cc, cursor|c  (also work with CLI --from)

Powered by 'continues' (${CONTINUES_VERSION}, MIT). https://github.com/yigitkonur/cli-continues
`;

function cmdRun(args) {
  const from = args.from || DEFAULT_FROM;
  const to = args.to || DEFAULT_TO;
  const preset = typeof args.preset === "string" ? args.preset : undefined;
  const format = typeof args.format === "string" ? args.format : undefined;
  const project = typeof args.project === "string" ? args.project : process.cwd();
  const out = typeof args.out === "string" ? args.out : undefined;

  const result = steal({ from, to, preset, format, project, out });
  process.stdout.write(result.text.endsWith("\n") ? result.text : result.text + "\n");
  process.stderr.write(
    `\n[steal-context] wrote ${result.outFile} (source=${result.fromTool.display}, preset=${result.preset}, format=${result.format}, engine=${result.engine})\n`,
  );
}

function reportInstall(results, { global, runner }) {
  for (const r of results) {
    if (r.skipped) {
      console.log(`skip   ${r.dest} (exists; use --force to overwrite)`);
    } else {
      const scope = r.global ? "global" : "project";
      const note = r.verified === false ? "  [path unverified — confirm with `doctor`]" : "";
      console.log(`write  ${r.dest}  (${scope})${note}`);
      for (const p of r.removedLegacy || []) console.log(`remove ${p} (legacy)`);
    }
  }
  const scopeMsg = global
    ? `\nDone. /steal is available in every project.`
    : `\nDone. /steal installed in this repo.`;
  console.log(
    `${scopeMsg}\n` +
      `  • Try /steal or /steal kilo|claude|cursor\n` +
      `  • Reload/restart each tool once if /steal doesn't appear yet.\n` +
      `  Runner: "${runner}"`,
  );
}

function cmdInit(args) {
  const preset = typeof args.preset === "string" ? args.preset : "";
  const runner = typeof args.runner === "string" ? args.runner : "steal-context";
  const project = typeof args.project === "string" ? args.project : process.cwd();
  const force = Boolean(args.force);
  // Global is the default. --local opts into per-repo commands.
  const global = !Boolean(args.local);

  if (args.a || args.b) {
    // Legacy explicit two-tool pairing.
    const a = args.a || DEFAULT_TO;
    const b = args.b || DEFAULT_FROM;
    const results = installBridge({ a, b, preset, runner, project, force, global });
    reportInstall(results, { global, runner });
    return;
  }

  const tools =
    typeof args.only === "string"
      ? args.only.split(",").map((s) => s.trim()).filter(Boolean)
      : Object.keys(TOOLS);
  const results = installAllCommands({ tools, preset, runner, project, force, global });
  reportInstall(results, { global, runner });
}

function cmdDoctor() {
  console.log(`node: ${process.version}`);
  console.log(`local continues resolved: ${hasLocalContinues() ? "yes" : "no (will use npx fallback)"}`);
  console.log(`\nDetected sessions per tool (continues scan):\n`);
  const res = runContinues(["scan"]);
  process.stdout.write(res.stdout || "");
  if (res.status !== 0) {
    process.stderr.write((res.stderr || "") + `\n(scan exited ${res.status})\n`);
  }
  console.log(`\nThe left-column slugs above are valid values for --from/--to.`);
  console.log(`Tools with a direct reader (used by --from ${AUTO}): ${Object.keys(TOOLS).join(", ")}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));

  try {
    switch (cmd) {
      case "run":
        cmdRun(args);
        break;
      case "init":
        cmdInit(args);
        break;
      case "doctor":
        cmdDoctor();
        break;
      case undefined:
      case "help":
      case "--help":
      case "-h":
        console.log(HELP);
        break;
      default:
        console.error(`Unknown command: ${cmd}\n`);
        console.log(HELP);
        process.exitCode = 1;
    }
  } catch (err) {
    console.error(`[steal-context] error: ${err.message}`);
    process.exitCode = 2;
  }
}

main();
