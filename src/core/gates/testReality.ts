import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  Gate,
  GateInput,
  GateResult,
  GateFinding,
  summarizeDiff,
  isTestFile,
} from "../gate.js";
import { NON_ASSERTIVE_TEST_RE, TEST_CLAIM_RE } from "./claimVsDiff.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const OUTPUT_TAIL_CHARS = 2_000;
const OUTPUT_BUFFER_CHARS = 8_000;

interface TestCommand {
  command: string;
  args: string[];
  label: string;
}

function hasAssertiveTestClaim(claim: string): boolean {
  const assertiveClaim = claim.replace(NON_ASSERTIVE_TEST_RE, " ");
  return TEST_CLAIM_RE.test(assertiveClaim);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function detectTestCommand(repoRoot: string): Promise<TestCommand | undefined> {
  const packageJson = join(repoRoot, "package.json");
  if (await fileExists(packageJson)) {
    try {
      const parsed = JSON.parse(await readFile(packageJson, "utf8")) as {
        scripts?: Record<string, unknown>;
      };
      if (typeof parsed.scripts?.test === "string" && parsed.scripts.test.trim()) {
        return { command: "npm", args: ["test"], label: "npm test" };
      }
    } catch {
      // Keep looking for other test runners; malformed package.json is not this gate's job.
    }
  }

  if (await fileExists(join(repoRoot, "pytest.ini"))) {
    return { command: "pytest", args: [], label: "pytest" };
  }

  const pyproject = join(repoRoot, "pyproject.toml");
  if (await fileExists(pyproject)) {
    const text = await readFile(pyproject, "utf8");
    if (/^\s*\[tool\.pytest(?:\.[^\]]+)?\]\s*$/m.test(text)) {
      return { command: "pytest", args: [], label: "pytest" };
    }
  }

  if (await fileExists(join(repoRoot, "Cargo.toml"))) {
    return { command: "cargo", args: ["test"], label: "cargo test" };
  }

  if (await fileExists(join(repoRoot, "go.mod"))) {
    return { command: "go", args: ["test", "./..."], label: "go test ./..." };
  }

  return undefined;
}

function tailOutput(output: string): string {
  const trimmed = output.trimEnd();
  if (!trimmed) return "<no output>";
  return trimmed.length > OUTPUT_TAIL_CHARS
    ? trimmed.slice(trimmed.length - OUTPUT_TAIL_CHARS)
    : trimmed;
}

function appendBounded(current: string, chunk: Buffer | string): string {
  const next = current + chunk.toString();
  return next.length > OUTPUT_BUFFER_CHARS
    ? next.slice(next.length - OUTPUT_BUFFER_CHARS)
    : next;
}

async function runCommand(
  repoRoot: string,
  testCommand: TestCommand,
  timeoutMs: number,
): Promise<{ ok: true; output: string } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    const child = spawn(testCommand.command, testCommand.args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      output = appendBounded(output, chunk);
    });
    child.stderr.on("data", (chunk) => {
      output = appendBounded(output, chunk);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        message:
          `Test command could not start (${testCommand.label}): ${err.message}\n` +
          `Output tail:\n${tailOutput(output)}`,
      });
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({
          ok: false,
          message:
            `Test command timed out after ${Math.round(timeoutMs / 1000)}s (${testCommand.label}).\n` +
            `Output tail:\n${tailOutput(output)}`,
        });
        return;
      }

      if (code === 0) {
        resolve({ ok: true, output });
      } else {
        const exitLabel = code === null ? `signal ${signal ?? "unknown"}` : `exit ${code}`;
        resolve({
          ok: false,
          message:
            `Test command failed (${testCommand.label}, ${exitLabel}).\n` +
            `Output tail:\n${tailOutput(output)}`,
        });
      }
    });
  });
}

export const testReality: Gate = {
  name: "test-reality",
  description: "Claims about tests are verified by rerunning the repository test command.",

  async run(input: GateInput): Promise<GateResult> {
    const findings: GateFinding[] = [];
    const summary = summarizeDiff(input.diff);
    const claimsTests = hasAssertiveTestClaim(input.claim);
    const touchesTestFile = summary.files.some(isTestFile);

    if (!claimsTests && !touchesTestFile) {
      return { gate: testReality.name, passed: true, findings };
    }

    if (input.context?.testRealityNoRun === true) {
      findings.push({
        severity: "warn",
        message: "test-reality skipped because --no-run was set; no test command was executed.",
      });
      return { gate: testReality.name, passed: true, findings };
    }

    if (!input.repoRoot) {
      findings.push({
        severity: "block",
        message: "test-reality needs repoRoot to run the test command.",
      });
      return { gate: testReality.name, passed: false, findings };
    }

    const testCommand = await detectTestCommand(input.repoRoot);
    if (!testCommand) {
      findings.push({
        severity: claimsTests ? "block" : "warn",
        message: claimsTests
          ? "Description claims tests but no test command exists."
          : "A test file changed, but no test command was detected.",
      });
      return { gate: testReality.name, passed: !claimsTests, findings };
    }

    const timeoutMs =
      typeof input.context?.testRealityTimeoutMs === "number"
        ? input.context.testRealityTimeoutMs
        : DEFAULT_TIMEOUT_MS;
    const result = await runCommand(input.repoRoot, testCommand, timeoutMs);
    if (!result.ok) {
      findings.push({ severity: "block", message: result.message });
    }

    return {
      gate: testReality.name,
      passed: findings.every((finding) => finding.severity !== "block"),
      findings,
    };
  },
};
