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

  // A path from a `--- a/x` / `+++ b/x` header, minus the prefix and any
  // trailing tab-separated metadata. `/dev/null` (pure add/delete) is skipped.
  const addHeaderPath = (line: string, prefix: string) => {
    const path = line.slice(prefix.length).split("\t")[0].trim();
    if (path && path !== "/dev/null") files.add(path);
  };

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      addHeaderPath(line, "+++ b/");
    } else if (line.startsWith("--- a/")) {
      // Captures pure deletions, where the `+++` side is /dev/null.
      addHeaderPath(line, "--- a/");
    } else if (line.startsWith("diff --git a/")) {
      // Captures renames and binary files, which have no ---/+++ body.
      const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (m) {
        files.add(m[1]);
        files.add(m[2]);
      }
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      addedLines++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      removedLines++;
    }
  }

  return { files: [...files], addedLines, removedLines };
}

/** Added lines grouped per file, for gates that inspect diff content. */
export function addedLinesByFile(diff: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  let current: string[] | undefined;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = line.slice(4).split("\t")[0].trim();
      if (path.startsWith("b/")) {
        current = map.get(path.slice(2)) ?? [];
        map.set(path.slice(2), current);
      } else {
        current = undefined; // /dev/null or unprefixed header
      }
    } else if (line.startsWith("+") && !line.startsWith("+++") && current) {
      current.push(line.slice(1));
    }
  }

  return map;
}

export function isTestFile(path: string): boolean {
  return /(^|\/)(tests?|__tests__|spec)\//i.test(path) || /\.(test|spec)\.[a-z]+$/i.test(path);
}

export function isDocOrCommentOnly(summary: DiffSummary): boolean {
  return summary.files.length > 0 && summary.files.every((f) => /\.(md|mdx|txt|rst)$/i.test(f));
}
