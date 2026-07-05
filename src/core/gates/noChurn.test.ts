import assert from "node:assert/strict";
import test from "node:test";
import { noChurn } from "./noChurn.js";

function diffFor(file: string, lines: string[]): string {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -1,2 +1,2 @@",
    ...lines,
  ].join("\n");
}

async function run(diff: string) {
  return noChurn.run({ claim: "Update implementation.", diff });
}

test("warns on a pure formatting hunk", async () => {
  const result = await run(
    diffFor("src/app.ts", [
      "-if (ready) {",
      "+if(ready){",
      "   run();",
      " }",
    ]),
  );

  assert.equal(result.passed, true);
  assert.equal(result.findings[0]?.severity, "warn");
  assert.match(result.findings[0]?.message ?? "", /Pure formatting hunk/);
});

test("does not warn when the hunk has a real code change", async () => {
  const result = await run(
    diffFor("src/app.ts", [
      "-const limit = 1;",
      "+const limit = 2;",
      " export const ready = true;",
    ]),
  );

  assert.deepEqual(result.findings, []);
});

test("warns on TODO placeholders in code", async () => {
  const result = await run(
    diffFor("src/app.ts", [
      " export function run() {",
      "+  // TODO: wire real validation",
      " }",
    ]),
  );

  assert.equal(result.passed, true);
  assert.match(result.findings[0]?.message ?? "", /TODO\/FIXME placeholder/);
});

test("does not warn on TODO text in markdown files", async () => {
  const result = await run(
    diffFor("README.md", [
      " ## Notes",
      "+TODO appears here as documentation text.",
    ]),
  );

  assert.deepEqual(result.findings, []);
});

test("warns once for formatting and also flags placeholders in a mixed diff", async () => {
  const diff = [
    diffFor("src/app.ts", [
      "-if (ready) {",
      "+if(ready){",
      "   run();",
      " }",
    ]),
    diffFor("src/worker.py", [
      " def run():",
      "+    pass",
    ]),
  ].join("\n");

  const result = await run(diff);

  assert.equal(result.findings.length, 2);
  assert.match(result.findings[0]?.message ?? "", /Pure formatting hunk/);
  assert.match(result.findings[1]?.message ?? "", /bare Python pass/);
});

test("does not warn on placeholders inside examples", async () => {
  const result = await run(
    diffFor("examples/fail-no-churn.patch", [
      "+// TODO: fixture placeholder",
    ]),
  );

  assert.deepEqual(result.findings, []);
});
