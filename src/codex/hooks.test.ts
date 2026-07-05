import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createCodexStopHookCommand,
  installCodexHook,
  mergeCodexStopHookConfig,
  runCodexStopHook,
} from "./hooks.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "codex-gate-hooks-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("generates a Stop hook command for the current CLI", () => {
  const command = createCodexStopHookCommand({
    nodePath: "/usr/local/bin/node",
    cliPath: "/tmp/codex gate/dist/cli.js",
  });

  assert.equal(command, "/usr/local/bin/node '/tmp/codex gate/dist/cli.js' codex-stop-hook");
});

test("merges a Stop hook without disturbing other hook events", () => {
  const existing = {
    hooks: {
      PreToolUse: [
        {
          matcher: "Shell",
          hooks: [{ type: "command", command: "echo pre", timeout: 3, statusMessage: "pre" }],
        },
      ],
    },
  };

  const { config, installed } = mergeCodexStopHookConfig(existing, "node cli.js codex-stop-hook");

  assert.equal(installed, true);
  assert.deepEqual((config.hooks as Record<string, unknown>).PreToolUse, existing.hooks.PreToolUse);
  const stop = (config.hooks as Record<string, unknown>).Stop as unknown[];
  assert.equal(stop.length, 1);
});

test("does not install the same Stop hook twice", () => {
  const command = "node cli.js codex-stop-hook";
  const first = mergeCodexStopHookConfig({}, command);
  const second = mergeCodexStopHookConfig(first.config, command);

  assert.equal(first.installed, true);
  assert.equal(second.installed, false);
  const stop = (second.config.hooks as Record<string, unknown>).Stop as unknown[];
  assert.equal(stop.length, 1);
});

test("writes project-local hooks.json idempotently", async () => {
  await withTempDir(async (repoRoot) => {
    const first = await installCodexHook({
      repoRoot,
      nodePath: "/usr/local/bin/node",
      cliPath: "/tmp/codex-gate/dist/cli.js",
    });
    const second = await installCodexHook({
      repoRoot,
      nodePath: "/usr/local/bin/node",
      cliPath: "/tmp/codex-gate/dist/cli.js",
    });

    assert.equal(first.installed, true);
    assert.equal(second.installed, false);

    const config = JSON.parse(await readFile(join(repoRoot, ".codex", "hooks.json"), "utf8")) as {
      hooks: { Stop: unknown[] };
    };
    assert.equal(config.hooks.Stop.length, 1);
  });
});

test("Stop hook maps a blocking codex-gate run to Codex exit code 2", async () => {
  await withTempDir(async (repoRoot) => {
    const runner = join(repoRoot, "fake-cli.js");
    await writeFile(
      runner,
      [
        "if (process.argv[2] !== 'run') process.exit(99);",
        "console.log('[BLOCK] fixture');",
        "process.exit(1);",
      ].join("\n"),
    );

    const originalStderr = process.stderr.write;
    let stderr = "";
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += chunk.toString();
      return true;
    }) as typeof process.stderr.write;

    try {
      const code = await runCodexStopHook({
        stdin: JSON.stringify({
          hook_event_name: "Stop",
          cwd: repoRoot,
          last_assistant_message: "Tests pass.",
        }),
        nodePath: process.execPath,
        cliPath: runner,
      });

      assert.equal(code, 2);
      assert.match(stderr, /codex-gate blocked/);
      assert.match(stderr, /\[BLOCK\] fixture/);
    } finally {
      process.stderr.write = originalStderr;
    }
  });
});
