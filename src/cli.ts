#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { runGates } from "./core/registry.js";
import { GateInput } from "./core/gate.js";
import { loadCodexContext, toContext } from "./codex/adapter.js";

function readMaybeFile(value: string | undefined, fallback: () => string): string {
  if (!value) return fallback();
  if (value === "-") return readFileSync(0, "utf8");
  return readFileSync(value, "utf8");
}

function git(cmd: string): string {
  return execSync(`git ${cmd}`, { encoding: "utf8" });
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

async function main() {
  const [, , command, ...rest] = process.argv;
  if (command !== "run") {
    console.error("usage: codex-gate run [--staged] [--diff <file|->] [--claim <file|->] [--no-run]");
    process.exit(2);
  }

  const args = parseArgs(rest);
  const repoRoot = (args.repo as string) || process.cwd();

  const diff = readMaybeFile(
    args.diff as string | undefined,
    () => (args.staged ? git("diff --cached") : git("diff HEAD")),
  );
  const claim = readMaybeFile(
    args.claim as string | undefined,
    () => git("log -1 --pretty=%B"),
  );

  // An empty diff has nothing to gate. Without this, the default invocation on
  // a clean tree would judge the last commit's message against no changes at
  // all — a mismatched pairing that produces nonsense findings.
  if (!diff.trim()) {
    console.log("codex-gate: empty diff — nothing to gate.");
    process.exit(0);
  }

  const input: GateInput = {
    claim,
    diff,
    repoRoot,
    context: {
      ...toContext(loadCodexContext(repoRoot)),
      testRealityNoRun: args["no-run"] === true,
    },
  };

  const results = await runGates(input);

  let blocked = false;
  for (const r of results) {
    const status = r.passed ? "PASS" : "BLOCK";
    console.log(`\n[${status}] ${r.gate}`);
    for (const f of r.findings) {
      console.log(`  ${f.severity === "block" ? "✗" : "!"} ${f.message}`);
      if (f.severity === "block") blocked = true;
    }
    if (r.findings.length === 0) console.log("  ✓ clean");
  }

  console.log(blocked ? "\ncodex-gate: BLOCKED" : "\ncodex-gate: ok");
  process.exit(blocked ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
