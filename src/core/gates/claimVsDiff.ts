import {
  Gate,
  GateInput,
  GateResult,
  GateFinding,
  summarizeDiff,
  isTestFile,
  isDocOrCommentOnly,
} from "../gate.js";

const TEST_CLAIM_RE = /\b(tests?|tested|testing|unit test|coverage|spec)\b/i;

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
    if (TEST_CLAIM_RE.test(claim) && !summary.files.some(isTestFile)) {
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
      if (/\.(md|txt)$/i.test(file)) continue; // ignore prose references
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
