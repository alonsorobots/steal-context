import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTO, resolveFromArgs, resolveTool } from "../src/tools.mjs";

test("resolveTool maps short aliases", () => {
  assert.equal(resolveTool("k").source, "kilo-code");
  assert.equal(resolveTool("kilo").source, "kilo-code");
  assert.equal(resolveTool("cc").source, "claude-code");
  assert.equal(resolveTool("claude").source, "claude-code");
  assert.equal(resolveTool("c").source, "cursor");
  assert.equal(resolveTool("cursor").source, "cursor");
  assert.equal(resolveTool("auto").source, AUTO);
});

test("resolveFromArgs defaults empty / literal $ARGUMENTS to auto", () => {
  assert.deepEqual(resolveFromArgs(""), { from: AUTO });
  assert.deepEqual(resolveFromArgs("   "), { from: AUTO });
  assert.deepEqual(resolveFromArgs(undefined), { from: AUTO });
  assert.deepEqual(resolveFromArgs("$ARGUMENTS"), { from: AUTO });
  assert.deepEqual(resolveFromArgs("${ARGUMENTS}"), { from: AUTO });
});

test("resolveFromArgs takes the first token only", () => {
  assert.deepEqual(resolveFromArgs("kilo please"), { from: "kilo-code" });
  assert.deepEqual(resolveFromArgs("CC"), { from: "claude-code" });
  assert.deepEqual(resolveFromArgs("c"), { from: "cursor" });
});

test("resolveFromArgs rejects unknown sources", () => {
  const r = resolveFromArgs("windsurf");
  assert.equal(r.from, null);
  assert.match(r.error, /Unrecognized source "windsurf"/);
});
