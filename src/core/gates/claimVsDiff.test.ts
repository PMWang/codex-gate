import assert from "node:assert/strict";
import test from "node:test";
import { claimVsDiff } from "./claimVsDiff.js";

function diffFor(file: string, addedLine = "+export const changed = true;"): string {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -1 +1,2 @@",
    " export const existing = true;",
    addedLine,
  ].join("\n");
}

async function run(claim: string, diff: string) {
  return claimVsDiff.run({ claim, diff });
}

test("blocks claims about tests when no test file changed", async () => {
  const result = await run("Add parser tests and coverage for edge cases.", diffFor("src/parser.ts"));

  assert.equal(result.passed, false);
  assert.equal(result.findings[0]?.severity, "block");
  assert.match(result.findings[0]?.message ?? "", /mentions tests/);
});

test("blocks tested/testing/spec claims when no test file changed", async () => {
  for (const claim of [
    "I tested the parser changes.",
    "Adds testing coverage for parser behavior.",
    "Adds a parser spec for edge cases.",
  ]) {
    const result = await run(claim, diffFor("src/parser.ts"));

    assert.equal(result.passed, false, claim);
    assert.equal(result.findings[0]?.severity, "block", claim);
  }
});

test("warns when a bug-fix claim only changes documentation", async () => {
  const result = await run("Fix the parser crash on empty input.", diffFor("README.md", "+Document parser setup."));

  assert.equal(result.passed, true);
  assert.equal(result.findings[0]?.severity, "warn");
  assert.match(result.findings[0]?.message ?? "", /claims a fix/);
});

test("warns on a long description for a trivial diff", async () => {
  const claim = [
    "This comprehensive change rebuilds the parser architecture with stronger validation, better fallback behavior,",
    "improved developer ergonomics, cleaner edge case handling, broader safety guarantees, expanded documentation,",
    "and a more maintainable foundation for future work across the whole codebase, plus safer integrations,",
    "clearer interfaces, stronger operational confidence, and a carefully redesigned internal implementation.",
  ].join(" ");

  const result = await run(claim, diffFor("src/parser.ts"));

  assert.equal(result.passed, true);
  assert.equal(result.findings[0]?.severity, "warn");
  assert.match(result.findings[0]?.message ?? "", /Long description/);
});

test("warns when a named source file is not present in the diff", async () => {
  const result = await run("Update src/validator.ts to handle empty input.", diffFor("src/parser.ts"));

  assert.equal(result.passed, true);
  assert.equal(result.findings[0]?.severity, "warn");
  assert.match(result.findings[0]?.message ?? "", /src\/validator\.ts/);
});

test("passes when a test claim is matched by a test-file diff", async () => {
  const result = await run("Add unit tests for claim-vs-diff behavior.", diffFor("src/core/gates/claimVsDiff.test.ts"));

  assert.deepEqual(result, {
    gate: "claim-vs-diff",
    passed: true,
    findings: [],
  });
});
