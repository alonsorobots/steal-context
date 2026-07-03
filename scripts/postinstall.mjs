#!/usr/bin/env node
// Auto-install global /steal slash commands after `npm install -g steal-context`.
// Skip with STEAL_SKIP_INIT=1 (CI, packaging, etc.).

import { installBridge } from "../src/install.mjs";
import { DEFAULT_FROM, DEFAULT_TO } from "../src/tools.mjs";

if (process.env.STEAL_SKIP_INIT === "1") {
  process.exit(0);
}

// Only run for global installs — not when steal-context is a dev dependency
// in someone else's repo (`npm install` in the steal-context repo itself).
if (process.env.npm_config_global !== "true") {
  process.exit(0);
}

try {
  const results = installBridge({
    a: DEFAULT_TO,
    b: DEFAULT_FROM,
    global: true,
    force: false,
  });
  const wrote = results.filter((r) => !r.skipped);
  if (!wrote.length) {
    process.exit(0);
  }
  console.log("\n[steal-context] Installed /steal for all projects:");
  for (const r of wrote) console.log(`  ${r.dest}`);
  console.log(
    "\nFirst-time setup (once):\n" +
      "  • Cursor — reload window: Ctrl+Shift+P → Developer: Reload Window\n" +
      "  • Kilo   — start a new chat\n" +
      "\nThen type /steal in either tool from any project.\n",
  );
} catch (err) {
  console.warn(`[steal-context] postinstall setup skipped: ${err.message}`);
}
