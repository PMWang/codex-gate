import {
  Gate,
  GateInput,
  GateResult,
  GateFinding,
  summarizeDiff,
  isTestFile,
  isDocOrCommentOnly,
} from "../gate.js";

export const TEST_CLAIM_RE = /\b(tests?|tested|testing|unit test|coverage|spec)\b/i;

// Test mentions that are negated ("no tests needed", "tests are not required")
// or explicitly manual ("verified via manual testing") are not claims that test
// files changed. They get stripped before TEST_CLAIM_RE runs.
const TEST_WORD = String.raw`(?:tests?|tested|testing|unit tests?|coverage|specs?)`;
export const NON_ASSERTIVE_TEST_RE = new RegExp(
  [
    String.raw`\b(?:no|not|without|don'?t|doesn'?t|didn'?t|never|skip(?:s|ped)?|omit(?:s|ted)?)\b[^.!?\n]{0,40}?\b${TEST_WORD}\b`,
    String.raw`\b${TEST_WORD}\b[^.!?\n]{0,40}?\b(?:not|aren'?t|weren'?t|skipped|omitted|deferred|unchanged)\b`,
    String.raw`\bmanual(?:ly)?[- ]${TEST_WORD}\b`,
    String.raw`\b${TEST_WORD}\s+manually\b`,
  ].join("|"),
  "gi",
);

// Extensions that plausibly name a real file in a change description. A
// whitelist keeps prose like "e.g.", "example.com", or "v1.2" from being read
// as filenames (anything with an unknown extension is ignored).
const CODE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "py", "rb", "go", "rs",
  "java", "kt", "kts", "swift", "c", "h", "cc", "cpp", "hpp", "cs", "php",
  "sh", "bash", "zsh", "yml", "yaml", "toml", "xml", "html", "css", "scss",
  "less", "sql", "proto", "vue", "svelte", "tf", "ini", "cfg", "gradle",
  "m", "mm", "plist", "lock", "env",
]);

// Detects the most common agent-output lie: a description that doesn't match
// what actually changed. Heuristic today; a deeper LLM-backed check can be
// layered on later behind the same interface.
export const claimVsDiff: Gate = {
  name: "claim-vs-diff",
  description: "The change description must match the diff.",

  async run(input: GateInput): Promise<GateResult> {
    const findings: GateFinding[] = [];
    const summary = summarizeDiff(input.diff);
    const claim = input.claim.toLowerCase();
    const totalLines = summary.addedLines + summary.removedLines;

    // 1. Claims tests were added/updated, but no test file changed.
    const assertiveClaim = claim.replace(NON_ASSERTIVE_TEST_RE, " ");
    if (TEST_CLAIM_RE.test(assertiveClaim) && !summary.files.some(isTestFile)) {
      findings.push({
        severity: "block",
        message:
          "Description mentions tests, but no test file is touched in the diff. " +
          "Add the tests or drop the claim.",
      });
    }

    // 2. Grand summary on a trivial change.
    const claimWords = claim.split(/\s+/).filter(Boolean).length;
    if (claimWords >= 40 && totalLines <= 3) {
      findings.push({
        severity: "warn",
        message: `Long description (${claimWords} words) for a ${totalLines}-line change. ` +
          "Make sure the summary isn't overselling the diff.",
      });
    }

    // 3. Claims a bug fix, but only docs/comments changed.
    if (/\b(fix|fixes|fixed|bug|patch)\b/.test(claim) && isDocOrCommentOnly(summary)) {
      findings.push({
        severity: "warn",
        message:
          "Description claims a fix, but only documentation files changed. " +
          "Verify the actual code path is touched.",
      });
    }

    // 4. Specific filenames named in the claim that aren't in the diff.
    const named = input.claim.match(/[\w./-]+\.[a-z]{1,5}\b/gi) ?? [];
    for (const file of new Set(named)) {
      const ext = file.split(".").pop()?.toLowerCase() ?? "";
      if (!CODE_EXTENSIONS.has(ext)) continue; // prose, URLs, versions, docs
      const inDiff = summary.files.some((f) => f.endsWith(file) || f === file);
      if (!inDiff) {
        findings.push({
          severity: "warn",
          message: `Description references "${file}", which is not in the diff.`,
        });
      }
    }

    const blocked = findings.some((f) => f.severity === "block");
    return { gate: claimVsDiff.name, passed: !blocked, findings };
  },
};
