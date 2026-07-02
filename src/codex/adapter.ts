import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Codex-native shell: turns a Codex/agent working context into a tool-agnostic
// GateInput. Today it loads the repo's AGENTS.md so AGENTS.md-aware gates can
// enforce it; more Codex conventions plug in here without touching the core.
export interface CodexContext {
  repoRoot: string;
  agentsMd?: string;
}

export function loadCodexContext(repoRoot: string): CodexContext {
  const agentsPath = join(repoRoot, "AGENTS.md");
  const agentsMd = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : undefined;
  return { repoRoot, agentsMd };
}

export function toContext(ctx: CodexContext): Record<string, unknown> {
  return { agentsMd: ctx.agentsMd };
}
