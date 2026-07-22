#!/usr/bin/env node
// Auto-install global /steal slash commands after `npm install -g steal-context`.
// Skip with STEAL_SKIP_INIT=1 (CI, packaging, etc.).

import { installAllCommands } from "../src/install.mjs";

if (process.env.STEAL_SKIP_INIT === "1") {
  process.exit(0);
}

// Only run for global installs — not when steal-context is a dev dependency
// in someone else's repo (`npm install` in the steal-context repo itself).
if (process.env.npm_config_global !== "true") {
  process.exit(0);
}

try {
  // Install /steal into every known tool, each using --from auto — so the
  // set of tools that can hand off to each other grows automatically as
  // more readers are added, with no reinstall needed by the user.
  const results = installAllCommands({ global: true, force: false });
  const wrote = results.filter((r) => !r.skipped);
  if (!wrote.length) {
    process.exit(0);
  }
  console.log("\n[steal-context] Installed /steal for all projects:");
  for (const r of wrote) console.log(`  ${r.dest}`);
  console.log(
    "\nFirst-time setup (once):\n" +
      "  • Cursor      — reload window: Ctrl+Shift+P → Developer: Reload Window\n" +
      "  • Kilo Code   — start a new chat\n" +
      "  • Claude Code — restart, or run /hooks once to reload config\n" +
      "\nThen type /steal (auto) or /steal kilo|claude|cursor to pin a source.\n" +
      "After upgrades: steal-context init --force\n",
  );
} catch (err) {
  console.warn(`[steal-context] postinstall setup skipped: ${err.message}`);
}
