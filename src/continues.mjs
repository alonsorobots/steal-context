// Thin wrapper around the `continues` CLI (https://github.com/yigitkonur/cli-continues, MIT).
// We prefer the copy installed as our dependency; if that can't be resolved we
// fall back to `npx --yes continues@<pinned>` so the tool still works when run
// in odd environments.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

// Keep in sync with the dependency range in package.json.
export const CONTINUES_VERSION = "4.1.1";

const MAX_BUFFER = 128 * 1024 * 1024; // session dumps can be large

function resolveLocalBin() {
  try {
    const pkgJsonPath = require.resolve("continues/package.json");
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    let binRel;
    if (typeof pkg.bin === "string") binRel = pkg.bin;
    else if (pkg.bin && typeof pkg.bin === "object")
      binRel = pkg.bin.continues ?? pkg.bin.cont ?? Object.values(pkg.bin)[0];
    if (!binRel) return null;
    return join(dirname(pkgJsonPath), binRel);
  } catch {
    return null;
  }
}

// Runs continues with the given args, returns { status, stdout, stderr }.
export function runContinues(args) {
  const localBin = resolveLocalBin();
  if (localBin) {
    return spawnSync(process.execPath, [localBin, ...args], {
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
    });
  }
  const isWin = process.platform === "win32";
  return spawnSync(isWin ? "npx.cmd" : "npx", ["--yes", `continues@${CONTINUES_VERSION}`, ...args], {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
    shell: isWin,
  });
}

export function hasLocalContinues() {
  return resolveLocalBin() != null;
}
