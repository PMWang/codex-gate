import { spawn } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

interface CommandHook {
  type: "command";
  command: string;
  timeout: number;
  statusMessage: string;
}

interface MatcherGroup {
  matcher?: string;
  hooks: CommandHook[];
}

type HooksByEvent = Record<string, unknown>;

export interface CodexHookInstallResult {
  hooksPath: string;
  command: string;
  installed: boolean;
}

export interface CodexStopHookInput {
  cwd?: string;
  hook_event_name?: string;
  last_assistant_message?: string | null;
  stop_hook_active?: boolean;
}

export const CODEX_HOOK_TIMEOUT_SECONDS = 180;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function createCodexStopHookCommand(options: {
  cliPath?: string;
  nodePath?: string;
  noRun?: boolean;
} = {}): string {
  const nodePath = options.nodePath ?? process.execPath;
  const cliPath = resolve(options.cliPath ?? process.argv[1] ?? "codex-gate");
  const args = [nodePath, cliPath, "codex-stop-hook"];
  if (options.noRun) args.push("--no-run");
  return args.map(shellQuote).join(" ");
}

export function createCodexStopHookGroup(command: string): MatcherGroup {
  return {
    hooks: [
      {
        type: "command",
        command,
        timeout: CODEX_HOOK_TIMEOUT_SECONDS,
        statusMessage: "Running codex-gate",
      },
    ],
  };
}

function hasCommand(groups: unknown[], command: string): boolean {
  return groups.some((group) => {
    if (!isRecord(group) || !Array.isArray(group.hooks)) return false;
    return group.hooks.some(
      (hook) => isRecord(hook) && hook.type === "command" && hook.command === command,
    );
  });
}

export function mergeCodexStopHookConfig(
  existing: unknown,
  command: string,
): { config: Record<string, unknown>; installed: boolean } {
  const config = isRecord(existing)
    ? (JSON.parse(JSON.stringify(existing)) as Record<string, unknown>)
    : {};
  const hooks: HooksByEvent = isRecord(config.hooks)
    ? (config.hooks as HooksByEvent)
    : {};
  const stopGroups = Array.isArray(hooks.Stop) ? hooks.Stop : [];

  if (hasCommand(stopGroups, command)) {
    config.hooks = hooks;
    return { config, installed: false };
  }

  hooks.Stop = [...stopGroups, createCodexStopHookGroup(command)];
  config.hooks = hooks;
  return { config, installed: true };
}

export async function installCodexHook(options: {
  repoRoot: string;
  hooksPath?: string;
  command?: string;
  noRun?: boolean;
  cliPath?: string;
  nodePath?: string;
}): Promise<CodexHookInstallResult> {
  const hooksPath = options.hooksPath ?? join(options.repoRoot, ".codex", "hooks.json");
  const command =
    options.command ??
    createCodexStopHookCommand({
      cliPath: options.cliPath,
      nodePath: options.nodePath,
      noRun: options.noRun,
    });

  let existing: unknown = {};
  try {
    existing = JSON.parse(await readFile(hooksPath, "utf8")) as unknown;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw new Error(`Could not parse existing Codex hook file ${hooksPath}: ${(err as Error).message}`);
    }
  }

  const { config, installed } = mergeCodexStopHookConfig(existing, command);
  if (installed) {
    await mkdir(dirname(hooksPath), { recursive: true });
    await writeFile(hooksPath, `${JSON.stringify(config, null, 2)}\n`);
  }

  return { hooksPath, command, installed };
}

function compactHookOutput(output: string): string {
  const trimmed = output.trim();
  if (!trimmed) return "<no output>";
  return trimmed.length > 4_000 ? trimmed.slice(trimmed.length - 4_000) : trimmed;
}

function readAllStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => resolve(input));
    process.stdin.on("error", reject);
  });
}

async function appendHookLog(line: string): Promise<void> {
  const logPath = process.env.CODEX_GATE_HOOK_LOG;
  if (!logPath) return;
  await appendFile(logPath, `${new Date().toISOString()} ${line}\n`);
}

function runChild(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ code: number | null; signal: NodeJS.Signals | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal, output }));
  });
}

export async function runCodexStopHook(options: {
  stdin?: string;
  cliPath?: string;
  nodePath?: string;
  noRun?: boolean;
} = {}): Promise<number> {
  const stdin = options.stdin ?? (await readAllStdin());
  let input: CodexStopHookInput;

  try {
    input = JSON.parse(stdin) as CodexStopHookInput;
  } catch (err) {
    console.error(`codex-gate: invalid Stop hook JSON: ${(err as Error).message}`);
    return 1;
  }

  if (input.stop_hook_active) {
    await appendHookLog("event=Stop stop_hook_active=true hook_exit=0");
    process.stdout.write(JSON.stringify({ continue: true }));
    return 0;
  }

  const claim = typeof input.last_assistant_message === "string" ? input.last_assistant_message : "";
  if (!claim.trim()) {
    await appendHookLog("event=Stop claim_chars=0 hook_exit=0");
    process.stdout.write(JSON.stringify({ continue: true }));
    return 0;
  }

  const repoRoot = input.cwd ?? process.cwd();
  const cliPath = resolve(options.cliPath ?? process.argv[1] ?? "codex-gate");
  const nodePath = options.nodePath ?? process.execPath;
  const tempDir = await mkdtemp(join(tmpdir(), "codex-gate-stop-"));
  const claimPath = join(tempDir, "last-assistant-message.txt");

  try {
    await writeFile(claimPath, claim);
    const args = [cliPath, "run", "--claim", claimPath, "--repo", repoRoot];
    if (options.noRun) args.push("--no-run");

    const result = await runChild(nodePath, args, repoRoot);
    if (result.code === 0) {
      await appendHookLog(`event=Stop claim_chars=${claim.length} codex_gate_exit=0 hook_exit=0`);
      process.stdout.write(JSON.stringify({ continue: true }));
      return 0;
    }

    if (result.code === 1) {
      await appendHookLog(`event=Stop claim_chars=${claim.length} codex_gate_exit=1 hook_exit=2`);
      console.error(
        [
          "codex-gate blocked this Codex turn. Fix the reported issue, then stop again.",
          "",
          compactHookOutput(result.output),
        ].join("\n"),
      );
      return 2;
    }

    const exitLabel =
      result.code === null ? `signal ${result.signal ?? "unknown"}` : `exit ${result.code}`;
    await appendHookLog(
      `event=Stop claim_chars=${claim.length} codex_gate_exit=${result.code ?? "null"} hook_exit=${result.code ?? 1}`,
    );
    console.error(`codex-gate Stop hook failed (${exitLabel}).\n${compactHookOutput(result.output)}`);
    return result.code ?? 1;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
