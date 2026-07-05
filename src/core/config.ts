import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Gate } from "./gate.js";

export const CONFIG_FILE = ".codex-gate.yml";
export const LONG_DESCRIPTION_THRESHOLD = "claim-vs-diff.long-description-words";
export const TEST_REALITY_TIMEOUT = "test-reality.timeout-ms";

export interface CodexGateConfig {
  gates: Record<string, boolean>;
  thresholds: Record<string, number>;
  warnings: string[];
}

function emptyConfig(warnings: string[] = []): CodexGateConfig {
  return { gates: {}, thresholds: {}, warnings };
}

function stripComment(line: string): string {
  const match = line.match(/^(.*?)(?:\s+#.*)?$/);
  return (match?.[1] ?? line).trimEnd();
}

function parseGateValue(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "on" || normalized === "true") return true;
  if (normalized === "off" || normalized === "false") return false;
  return undefined;
}

function parseNumberValue(value: string): number | undefined {
  if (!/^-?\d+(?:\.\d+)?$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseEntry(line: string): [string, string] | undefined {
  const match = line.match(/^([A-Za-z0-9_.-]+)\s*:\s*(\S.*?)\s*$/);
  return match ? [match[1], match[2].trim()] : undefined;
}

function parseInlineObject(value: string): string[] | undefined {
  const trimmed = value.trim();
  const match = trimmed.match(/^\{(.*)\}$/);
  if (!match) return undefined;
  const inner = match[1].trim();
  return inner ? inner.split(",").map((part) => part.trim()).filter(Boolean) : [];
}

function parseGateEntry(
  line: string,
  config: CodexGateConfig,
  warnings: string[],
): void {
  const entry = parseEntry(line);
  if (!entry) {
    warnings.push(`unsupported gates entry: ${line.trim()}`);
    return;
  }

  const [name, rawValue] = entry;
  const value = parseGateValue(rawValue);
  if (value === undefined) {
    warnings.push(`unsupported gate value for ${name}: ${rawValue}`);
    return;
  }
  config.gates[name] = value;
}

function parseThresholdEntry(
  line: string,
  config: CodexGateConfig,
  warnings: string[],
): void {
  const entry = parseEntry(line);
  if (!entry) {
    warnings.push(`unsupported thresholds entry: ${line.trim()}`);
    return;
  }

  const [name, rawValue] = entry;
  const value = parseNumberValue(rawValue);
  if (value === undefined) {
    warnings.push(`unsupported threshold value for ${name}: ${rawValue}`);
    return;
  }
  config.thresholds[name] = value;
}

export function parseCodexGateConfig(text: string): CodexGateConfig {
  const warnings: string[] = [];
  const config = emptyConfig(warnings);
  let section: "gates" | "thresholds" | undefined;

  for (const rawLine of text.split("\n")) {
    const line = stripComment(rawLine);
    if (!line.trim()) continue;

    const topLevel = !/^\s/.test(rawLine);
    const gatesMatch = line.match(/^gates\s*:\s*(.*)$/);
    const thresholdsMatch = line.match(/^thresholds\s*:\s*(.*)$/);

    if (topLevel && gatesMatch) {
      section = "gates";
      const inline = gatesMatch[1].trim();
      if (inline) {
        const entries = parseInlineObject(inline);
        if (!entries) {
          warnings.push(`unsupported gates syntax: ${line.trim()}`);
        } else {
          for (const entry of entries) parseGateEntry(entry, config, warnings);
        }
      }
      continue;
    }

    if (topLevel && thresholdsMatch) {
      section = "thresholds";
      const inline = thresholdsMatch[1].trim();
      if (inline) {
        const entries = parseInlineObject(inline);
        if (!entries) {
          warnings.push(`unsupported thresholds syntax: ${line.trim()}`);
        } else {
          for (const entry of entries) parseThresholdEntry(entry, config, warnings);
        }
      }
      continue;
    }

    if (!topLevel && section === "gates") {
      parseGateEntry(line.trim(), config, warnings);
      continue;
    }

    if (!topLevel && section === "thresholds") {
      parseThresholdEntry(line.trim(), config, warnings);
      continue;
    }

    warnings.push(`unsupported config line: ${line.trim()}`);
  }

  return config;
}

export function loadCodexGateConfig(repoRoot: string): CodexGateConfig {
  const path = join(repoRoot, CONFIG_FILE);
  if (!existsSync(path)) return emptyConfig();

  try {
    return parseCodexGateConfig(readFileSync(path, "utf8"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return emptyConfig([`could not read ${CONFIG_FILE}: ${message}`]);
  }
}

export function enabledGates(gates: Gate[], config: CodexGateConfig): Gate[] {
  return gates.filter((gate) => config.gates[gate.name] !== false);
}

export function disabledGateNames(gates: Gate[], config: CodexGateConfig): string[] {
  return gates.filter((gate) => config.gates[gate.name] === false).map((gate) => gate.name);
}

export function thresholdContext(config: CodexGateConfig): Record<string, unknown> {
  const context: Record<string, unknown> = {};
  const longDescriptionWords = config.thresholds[LONG_DESCRIPTION_THRESHOLD];
  const testRealityTimeoutMs = config.thresholds[TEST_REALITY_TIMEOUT];

  if (typeof longDescriptionWords === "number") {
    context.claimVsDiffLongDescriptionWords = longDescriptionWords;
  }
  if (typeof testRealityTimeoutMs === "number") {
    context.testRealityTimeoutMs = testRealityTimeoutMs;
  }

  return context;
}
