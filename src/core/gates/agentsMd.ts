import {
  Gate,
  GateInput,
  GateResult,
  GateFinding,
  addedLinesByFile,
} from "../gate.js";

// Enforces the machine-checkable rules a repo declares in its AGENTS.md.
// Prose rules stay prose — this gate only enforces what the repo has made
// explicit inside a fenced ```codex-gate block, so enforcement is
// deterministic and free (no LLM call). Two directives today:
//
//   forbid-import <path-prefix> <substring>
//     Block when a file under <path-prefix> adds an import/require line
//     containing <substring> (case-insensitive).
//
//   forbid-added <path-prefix> <regex>
//     Block when a file under <path-prefix> adds a line matching <regex>.
//
// Lines starting with `#` inside the block are comments.

export interface AgentsRule {
  kind: "forbid-import" | "forbid-added";
  prefix: string;
  arg: string;
}

export function parseAgentsRules(agentsMd: string): AgentsRule[] {
  const rules: AgentsRule[] = [];
  const blocks = agentsMd.match(/```codex-gate\n[\s\S]*?```/g) ?? [];

  for (const block of blocks) {
    for (const raw of block.split("\n").slice(1)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || line.startsWith("```")) continue;
      const m = line.match(/^(forbid-import|forbid-added)\s+(\S+)\s+(.+)$/);
      if (m) {
        rules.push({ kind: m[1] as AgentsRule["kind"], prefix: m[2], arg: m[3].trim() });
      }
    }
  }

  return rules;
}

const IMPORT_LINE_RE =
  /^\s*(import\b|export\s+.*\bfrom\b|const\s+.*=\s*require\(|from\s+\S+\s+import\b|require\s+["']|use\s+\S+|#include)/;

export const agentsMd: Gate = {
  name: "agents-md",
  description: "The diff must respect the machine-checkable rules in AGENTS.md.",

  async run(input: GateInput): Promise<GateResult> {
    const findings: GateFinding[] = [];
    const source = typeof input.context?.agentsMd === "string" ? input.context.agentsMd : "";
    const rules = source ? parseAgentsRules(source) : [];

    if (rules.length > 0) {
      const added = addedLinesByFile(input.diff);

      for (const rule of rules) {
        for (const [file, lines] of added) {
          if (!file.startsWith(rule.prefix)) continue;

          if (rule.kind === "forbid-import") {
            const needle = rule.arg.toLowerCase();
            for (const line of lines) {
              if (IMPORT_LINE_RE.test(line) && line.toLowerCase().includes(needle)) {
                findings.push({
                  severity: "block",
                  message:
                    `AGENTS.md rule: files under ${rule.prefix} must not import ` +
                    `"${rule.arg}" — found in ${file}: ${line.trim()}`,
                });
              }
            }
          } else {
            let re: RegExp;
            try {
              re = new RegExp(rule.arg);
            } catch {
              findings.push({
                severity: "warn",
                message: `AGENTS.md rule has an invalid regex and was skipped: forbid-added ${rule.prefix} ${rule.arg}`,
              });
              break; // the rule is unusable for every file; report once
            }
            for (const line of lines) {
              if (re.test(line)) {
                findings.push({
                  severity: "block",
                  message:
                    `AGENTS.md rule: files under ${rule.prefix} must not add ` +
                    `lines matching /${rule.arg}/ — found in ${file}: ${line.trim()}`,
                });
              }
            }
          }
        }
      }
    }

    const blocked = findings.some((f) => f.severity === "block");
    return { gate: agentsMd.name, passed: !blocked, findings };
  },
};
