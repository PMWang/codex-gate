// Tool-agnostic gate engine. Nothing in src/core may import Codex-specific code.

export interface GateInput {
  /** The change description the agent produced (commit message or PR body). */
  claim: string;
  /** Unified git diff of the change. */
  diff: string;
  /** Repo root, for gates that need to run things (tests, etc). */
  repoRoot?: string;
  /** Adapter-supplied context (e.g. parsed AGENTS.md rules). */
  context?: Record<string, unknown>;
}

export interface GateFinding {
  /** `block` fails the run (non-zero exit); `warn` is advisory. */
  severity: "block" | "warn";
  message: string;
}

export interface GateResult {
  gate: string;
  passed: boolean;
  findings: GateFinding[];
}

export interface Gate {
  name: string;
  description: string;
  run(input: GateInput): Promise<GateResult>;
}

/** Parsed view of a unified diff that gates can share. */
export interface DiffSummary {
  files: string[];
  addedLines: number;
  removedLines: number;
}

export function summarizeDiff(diff: string): DiffSummary {
  const files = new Set<string>();
  let addedLines = 0;
  let removedLines = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      files.add(line.slice("+++ b/".length).trim());
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      addedLines++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      removedLines++;
    }
  }

  return { files: [...files], addedLines, removedLines };
}

export function isTestFile(path: string): boolean {
  return /(^|\/)(tests?|__tests__|spec)\//i.test(path) || /\.(test|spec)\.[a-z]+$/i.test(path);
}

export function isDocOrCommentOnly(summary: DiffSummary): boolean {
  return summary.files.length > 0 && summary.files.every((f) => /\.(md|mdx|txt|rst)$/i.test(f));
}
