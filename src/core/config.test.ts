import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  enabledGates,
  loadCodexGateConfig,
  parseCodexGateConfig,
  thresholdContext,
} from "./config.js";
import { Gate } from "./gate.js";
import { claimVsDiff } from "./gates/claimVsDiff.js";

function diffFor(file: string): string {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -1 +1,2 @@",
    " export const existing = true;",
    "+export const changed = true;",
  ].join("\n");
}

test("parses minimal block config", () => {
  const config = parseCodexGateConfig([
    "gates:",
    "  no-churn: off",
    "  test-reality: on",
    "thresholds:",
    "  claim-vs-diff.long-description-words: 60",
    "  test-reality.timeout-ms: 45000",
  ].join("\n"));

  assert.deepEqual(config.gates, { "no-churn": false, "test-reality": true });
  assert.deepEqual(config.thresholds, {
    "claim-vs-diff.long-description-words": 60,
    "test-reality.timeout-ms": 45000,
  });
  assert.deepEqual(config.warnings, []);
});

test("parses inline config", () => {
  const config = parseCodexGateConfig([
    "gates: {no-churn: off, agents-md: on}",
    "thresholds: {claim-vs-diff.long-description-words: 55}",
  ].join("\n"));

  assert.equal(config.gates["no-churn"], false);
  assert.equal(config.gates["agents-md"], true);
  assert.equal(config.thresholds["claim-vs-diff.long-description-words"], 55);
});

test("disabled gates are skipped by name", () => {
  const gates = [
    { name: "claim-vs-diff", description: "", run: async () => ({ gate: "claim-vs-diff", passed: true, findings: [] }) },
    { name: "no-churn", description: "", run: async () => ({ gate: "no-churn", passed: true, findings: [] }) },
  ] satisfies Gate[];
  const config = parseCodexGateConfig("gates: {no-churn: off}");

  assert.deepEqual(enabledGates(gates, config).map((gate) => gate.name), ["claim-vs-diff"]);
});

test("threshold context changes claim-vs-diff long-description behavior", async () => {
  const config = parseCodexGateConfig("thresholds: {claim-vs-diff.long-description-words: 100}");
  const claim = [
    "This comprehensive change rebuilds the parser architecture with stronger validation, better fallback behavior,",
    "improved developer ergonomics, cleaner edge case handling, broader safety guarantees, expanded documentation,",
    "and a more maintainable foundation for future work across the whole codebase.",
  ].join(" ");

  const result = await claimVsDiff.run({
    claim,
    diff: diffFor("src/parser.ts"),
    context: thresholdContext(config),
  });

  assert.deepEqual(result.findings, []);
});

test("bad config degrades to defaults with warnings", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "codex-gate-config-"));
  try {
    await writeFile(join(repoRoot, ".codex-gate.yml"), "gates:\n  no-churn: maybe\nnonsense\n");

    const config = loadCodexGateConfig(repoRoot);

    assert.deepEqual(config.gates, {});
    assert.equal(config.thresholds["claim-vs-diff.long-description-words"], undefined);
    assert.ok(config.warnings.length >= 1);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
