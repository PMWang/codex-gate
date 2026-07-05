import assert from "node:assert/strict";
import test from "node:test";
import { summarizeDiff } from "./gate.js";

test("summarizeDiff reads files from +++/--- headers and counts lines", () => {
  const diff = [
    "diff --git a/src/parser.ts b/src/parser.ts",
    "--- a/src/parser.ts",
    "+++ b/src/parser.ts",
    "@@ -1 +1,2 @@",
    " export const existing = true;",
    "+export const changed = true;",
  ].join("\n");

  const summary = summarizeDiff(diff);

  assert.deepEqual(summary.files, ["src/parser.ts"]);
  assert.equal(summary.addedLines, 1);
  assert.equal(summary.removedLines, 0);
});

test("summarizeDiff captures a pure deletion via the --- header", () => {
  const diff = [
    "diff --git a/src/old.ts b/src/old.ts",
    "deleted file mode 100644",
    "--- a/src/old.ts",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-export const old = true;",
  ].join("\n");

  const summary = summarizeDiff(diff);

  assert.ok(summary.files.includes("src/old.ts"));
  assert.equal(summary.removedLines, 1);
});

test("summarizeDiff captures both sides of a rename with no ---/+++ body", () => {
  const diff = [
    "diff --git a/src/oldName.ts b/src/newName.ts",
    "similarity index 100%",
    "rename from src/oldName.ts",
    "rename to src/newName.ts",
  ].join("\n");

  const summary = summarizeDiff(diff);

  assert.ok(summary.files.includes("src/oldName.ts"));
  assert.ok(summary.files.includes("src/newName.ts"));
});
