import assert from "node:assert/strict";
import test from "node:test";
import { agentsMd, parseAgentsRules } from "./agentsMd.js";

const AGENTS = [
  "# AGENTS.md",
  "",
  "Keep the core tool-agnostic (prose version of the rule).",
  "",
  "```codex-gate",
  "# machine-enforced rules",
  "forbid-import src/core/ codex",
  "forbid-added src/ debugger",
  "```",
].join("\n");

function diffAdding(file: string, line: string): string {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -1 +1,2 @@",
    " export const existing = true;",
    `+${line}`,
  ].join("\n");
}

async function run(diff: string, agentsText: string = AGENTS) {
  return agentsMd.run({ claim: "irrelevant", diff, context: { agentsMd: agentsText } });
}

test("parses directives from the fenced block, skipping comments", () => {
  const rules = parseAgentsRules(AGENTS);

  assert.equal(rules.length, 2);
  assert.deepEqual(rules[0], { kind: "forbid-import", prefix: "src/core/", arg: "codex" });
  assert.deepEqual(rules[1], { kind: "forbid-added", prefix: "src/", arg: "debugger" });
});

test("blocks a forbidden import added under the guarded prefix", async () => {
  const result = await run(
    diffAdding("src/core/gates/foo.ts", 'import { loadCodexContext } from "../../codex/adapter.js";'),
  );

  assert.equal(result.passed, false);
  assert.equal(result.findings[0]?.severity, "block");
  assert.match(result.findings[0]?.message ?? "", /must not import "codex"/);
});

test("allows the same import outside the guarded prefix", async () => {
  const result = await run(
    diffAdding("src/codex/glue.ts", 'import { loadCodexContext } from "./adapter.js";'),
  );

  assert.equal(result.passed, true);
  assert.deepEqual(result.findings, []);
});

test("does not treat a non-import mention as an import", async () => {
  const result = await run(
    diffAdding("src/core/gate.ts", "// nothing here may import codex-specific code"),
  );

  assert.equal(result.passed, true);
});

test("forbid-added blocks a matching added line", async () => {
  const result = await run(diffAdding("src/cli.ts", "debugger;"));

  assert.equal(result.passed, false);
  assert.match(result.findings[0]?.message ?? "", /matching \/debugger\//);
});

test("passes silently when AGENTS.md is absent or has no rules block", async () => {
  const noContext = await agentsMd.run({ claim: "x", diff: diffAdding("src/a.ts", "const a = 1;") });
  const noBlock = await run(diffAdding("src/a.ts", "const a = 1;"), "# AGENTS.md\nProse only.");

  assert.equal(noContext.passed, true);
  assert.deepEqual(noContext.findings, []);
  assert.equal(noBlock.passed, true);
  assert.deepEqual(noBlock.findings, []);
});

test("warns once and keeps going on an invalid regex rule", async () => {
  const badAgents = ["```codex-gate", "forbid-added src/ [unclosed", "```"].join("\n");
  const result = await run(diffAdding("src/a.ts", "const a = 1;"), badAgents);

  assert.equal(result.passed, true);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.severity, "warn");
  assert.match(result.findings[0]?.message ?? "", /invalid regex/);
});
