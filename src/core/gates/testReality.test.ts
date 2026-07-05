import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { testReality } from "./testReality.js";

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

async function withFixture(
  script: string | undefined,
  fn: (repoRoot: string) => Promise<void>,
): Promise<void> {
  const repoRoot = await mkdtemp(join(tmpdir(), "codex-gate-test-reality-"));
  try {
    if (script !== undefined) {
      await writeFile(
        join(repoRoot, "package.json"),
        JSON.stringify({ scripts: { test: script } }, null, 2),
      );
    }
    await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
}

test("passes when a test claim has a passing test command", async () => {
  await withFixture('node -e "process.exit(0)"', async (repoRoot) => {
    const result = await testReality.run({
      claim: "Ran tests for parser behavior.",
      diff: diffFor("src/parser.ts"),
      repoRoot,
    });

    assert.deepEqual(result, { gate: "test-reality", passed: true, findings: [] });
  });
});

test("blocks when a test claim has a failing test command", async () => {
  await withFixture('node -e "console.error(\'fixture failure\'); process.exit(1)"', async (repoRoot) => {
    const result = await testReality.run({
      claim: "Tests pass for parser behavior.",
      diff: diffFor("src/parser.ts"),
      repoRoot,
    });

    assert.equal(result.passed, false);
    assert.equal(result.findings[0]?.severity, "block");
    assert.match(result.findings[0]?.message ?? "", /fixture failure/);
  });
});

test("does not trigger when the claim and diff do not mention tests", async () => {
  await withFixture(undefined, async (repoRoot) => {
    const result = await testReality.run({
      claim: "Update parser behavior.",
      diff: diffFor("src/parser.ts"),
      repoRoot,
    });

    assert.deepEqual(result, { gate: "test-reality", passed: true, findings: [] });
  });
});

test("does not trigger on negated test language", async () => {
  await withFixture(undefined, async (repoRoot) => {
    const result = await testReality.run({
      claim: "Config-only tweak; no tests needed for this change.",
      diff: diffFor("src/config.ts"),
      repoRoot,
    });

    assert.deepEqual(result, { gate: "test-reality", passed: true, findings: [] });
  });
});

test("blocks when a test claim has no detected test command", async () => {
  await withFixture(undefined, async (repoRoot) => {
    const result = await testReality.run({
      claim: "Tests pass for parser behavior.",
      diff: diffFor("src/parser.ts"),
      repoRoot,
    });

    assert.equal(result.passed, false);
    assert.equal(result.findings[0]?.severity, "block");
    assert.match(result.findings[0]?.message ?? "", /no test command exists/);
  });
});

test("runs when a test file changes even without a test claim", async () => {
  await withFixture('node -e "process.exit(0)"', async (repoRoot) => {
    const result = await testReality.run({
      claim: "Update parser edge case.",
      diff: diffFor("src/parser.test.ts"),
      repoRoot,
    });

    assert.deepEqual(result, { gate: "test-reality", passed: true, findings: [] });
  });
});

test("skips with a warning when --no-run context is set", async () => {
  await withFixture(undefined, async (repoRoot) => {
    const result = await testReality.run({
      claim: "Tests pass for parser behavior.",
      diff: diffFor("src/parser.ts"),
      repoRoot,
      context: { testRealityNoRun: true },
    });

    assert.equal(result.passed, true);
    assert.equal(result.findings[0]?.severity, "warn");
    assert.match(result.findings[0]?.message ?? "", /--no-run/);
  });
});
