#!/usr/bin/env node
// Quiet the node:sqlite "ExperimentalWarning" (we use it deliberately, read-only).
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w && w.name === "ExperimentalWarning" && /SQLite/i.test(w.message)) return;
  process.emitWarning(w);
});

import { runContinues, hasLocalContinues, CONTINUES_VERSION } from "../src/continues.mjs";
import { steal, PRESETS, FORMATS } from "../src/steal.mjs";
import { installBridge } from "../src/install.mjs";
import { DEFAULT_FROM, DEFAULT_TO, TOOLS } from "../src/tools.mjs";

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

const HELP = `steal-context — pull the latest chat context from your OTHER AI coding tool.

Usage:
  steal-context run   [--from <tool>] [--to <tool>] [--preset <p>] [--format <f>] [--project <dir>] [--out <file>]
  steal-context init  [--a <tool>] [--b <tool>] [--preset <p>] [--runner <cmd>] [--local] [--force]
  steal-context doctor
  steal-context help

Commands:
  run     Extract the most recent <from> session (scoped to the project) and print a
          resume banner + handoff document to stdout. Also writes .steal/handoff.md.
  init    Install /steal slash commands (default: global — all projects).
          Pass --local to install into the current repo when the target tool supports it.
          Codex installs as a user-level custom prompt invoked with /prompts:steal.
          Global install also runs automatically on "npm install -g steal-context".
  doctor  Show detected tools/slugs (via 'continues scan') and environment checks.

Presets (context budget): ${PRESETS.join(", ")}
Formats:                  ${FORMATS.join(", ")}  (json = structured content-block dump; markdown = human-readable)
Known tools:              ${Object.keys(TOOLS).join(", ")}

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

function cmdInit(args) {
  const a = args.a || DEFAULT_TO; // cursor
  const b = args.b || DEFAULT_FROM; // kilo-code
  const preset = typeof args.preset === "string" ? args.preset : "";
  const runner = typeof args.runner === "string" ? args.runner : "steal-context";
  const project = typeof args.project === "string" ? args.project : process.cwd();
  const force = Boolean(args.force);
  // Global is the default. --local opts into per-repo commands.
  const global = !Boolean(args.local);

  const results = installBridge({ a, b, preset, runner, project, force, global });
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
  if (global) {
    console.log(
      `\nDone. steal commands are available in every project.` +
        `\n  • Cursor — reload window once if /steal doesn't appear yet` +
        `\n  • Kilo   — start a new chat` +
        `\n  • Claude — start a new session if /steal doesn't appear yet` +
        `\n  • Codex  — restart Codex, then invoke /prompts:steal` +
        `\nRunner: "${runner}"`,
    );
  } else {
    console.log(
      `\nDone. /steal installed in this repo.` +
        `\n  • Cursor — reload window if needed` +
        `\n  • Kilo   — start a new chat` +
        `\n  • Claude — start a new session if needed` +
        `\nRunner: "${runner}"`,
    );
  }
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
