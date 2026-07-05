import {
  Gate,
  GateInput,
  GateResult,
  GateFinding,
  addedLinesByFile,
  isTestFile,
} from "../gate.js";

interface DiffHunk {
  file: string;
  added: string[];
  removed: string[];
}

function changedHunks(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let file: string | undefined;
  let current: DiffHunk | undefined;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = line.slice(4).split("\t")[0].trim();
      file = path.startsWith("b/") ? path.slice(2) : undefined;
      current = undefined;
    } else if (line.startsWith("@@")) {
      if (file) {
        current = { file, added: [], removed: [] };
        hunks.push(current);
      } else {
        current = undefined;
      }
    } else if (current && line.startsWith("+") && !line.startsWith("+++")) {
      current.added.push(line.slice(1));
    } else if (current && line.startsWith("-") && !line.startsWith("---")) {
      current.removed.push(line.slice(1));
    }
  }

  return hunks;
}

function normalizedCounts(lines: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const normalized = line.replace(/\s+/g, "");
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return counts;
}

function sameNormalizedMultiset(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) return false;

  const leftCounts = normalizedCounts(left);
  const rightCounts = normalizedCounts(right);
  if (leftCounts.size !== rightCounts.size) return false;

  for (const [line, count] of leftCounts) {
    if (rightCounts.get(line) !== count) return false;
  }
  return true;
}

function skipsPlaceholderScan(file: string): boolean {
  return (
    file.startsWith("examples/") ||
    /\.(md|mdx|rst)$/i.test(file) ||
    isTestFile(file) ||
    /(^|\/)(__fixtures__|fixtures?|testdata)\//i.test(file)
  );
}

function hasQuotedTodoOnly(line: string): boolean {
  return /(["'`])[^"'`]*\b(?:TODO|FIXME)\b[^"'`]*\1/i.test(line);
}

function isMetaTodoReference(line: string): boolean {
  return (
    /\/.*(?:TODO|FIXME).*\/[a-z]*\.test\(/i.test(line) ||
    /^\s*return\s+["'`]TODO\/FIXME placeholder["'`];?$/.test(line)
  );
}

function placeholderReason(file: string, line: string): string | undefined {
  const trimmed = line.trim();

  if (/\.py$/i.test(file) && /^\s*pass\s*(?:#.*)?$/.test(line)) {
    return "bare Python pass statement";
  }

  if (/throw\s+new\s+Error\s*\(\s*(["'`])[^"'`]*(?:not\s+implemented|unimplemented|todo|fixme)[^"'`]*\1\s*\)/i.test(line)) {
    return "not-implemented throw";
  }

  if (/\b(?:TODO|FIXME)\b/i.test(line)) {
    if (isMetaTodoReference(line)) return undefined;
    const startsAsComment = /^(?:\/\/|#|\/\*|\*|<!--|--)/.test(trimmed);
    if (!startsAsComment && hasQuotedTodoOnly(line)) return undefined;
    return "TODO/FIXME placeholder";
  }

  return undefined;
}

export const noChurn: Gate = {
  name: "no-churn",
  description: "Warns about pure formatting hunks and placeholder work.",

  async run(input: GateInput): Promise<GateResult> {
    const findings: GateFinding[] = [];
    const pureFormattingFiles = new Set<string>();

    for (const hunk of changedHunks(input.diff)) {
      if (sameNormalizedMultiset(hunk.added, hunk.removed)) {
        pureFormattingFiles.add(hunk.file);
      }
    }

    for (const file of pureFormattingFiles) {
      findings.push({
        severity: "warn",
        message: `Pure formatting hunk in ${file}: added lines match removed lines after whitespace is ignored.`,
      });
    }

    for (const [file, lines] of addedLinesByFile(input.diff)) {
      if (skipsPlaceholderScan(file)) continue;
      for (const line of lines) {
        const reason = placeholderReason(file, line);
        if (reason) {
          findings.push({
            severity: "warn",
            message: `Placeholder added in ${file}: ${reason}.`,
          });
        }
      }
    }

    return { gate: noChurn.name, passed: true, findings };
  },
};
