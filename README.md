# codex-gate

[![CI](https://github.com/PMWang/codex-gate/actions/workflows/ci.yml/badge.svg)](https://github.com/PMWang/codex-gate/actions/workflows/ci.yml)

**A quality gate that keeps Codex honest.**

`codex-gate` inspects the changes an AI coding agent produces — *before* they get
committed or merged — and blocks the classic failure modes of agent output:
descriptions that don't match the diff, tests that were "passed" but never run,
churn that changes nothing, and rules the agent was told to follow but didn't.

It is built for the [OpenAI Codex](https://openai.com/codex/) workflow: it reads
your repo's `AGENTS.md`, gates staged changes or any diff from the command line,
and runs as a Codex CLI hook or pre-merge check in CI.

> Community project. Not affiliated with or endorsed by OpenAI.

---

## Why

Open-source maintainers are drowning in AI-generated "slop" — verbose changes
with descriptions nobody can defend, PRs that don't do what they claim. The
effort-based backpressure that used to keep low-quality contributions out is
gone. `codex-gate` puts a cheap, automatic gate back in front of the merge
button — aimed specifically at the output of your own Codex runs.

## What it checks (gates)

| Gate | Catches |
| --- | --- |
| **claim-vs-diff** | The description claims things the diff doesn't contain (e.g. "added tests" with no test files touched; a grand summary on a one-line change). |
| **test-reality** | Re-runs the tests instead of trusting "all green". |
| **no-churn** | Warns on pure formatting hunks and placeholder work. |
| **agents-md** | Enforces the rules in this repo's `AGENTS.md`. |
| _asset-gate_ (planned) | OCR / overlap checks on generated images (no baked-in text, no overlapping labels). |

## Quick start

```bash
npx codex-gate run --staged          # gate your staged changes + last commit msg
npx codex-gate run --diff change.patch --claim message.txt
```

(Working from a clone? `npm install`, then `npm run dev -- run --staged`.)

Exit code is non-zero if any gate **blocks**, so it drops straight into CI or a
git hook.

## Configuration

Optional `.codex-gate.yml`:

```yaml
gates: { no-churn: off }
thresholds: { claim-vs-diff.long-description-words: 40, test-reality.timeout-ms: 120000 }
```

Only `on`/`off` gate switches and numeric thresholds are supported; invalid config warns and falls back to defaults.

## Gate every Codex turn

```bash
codex-gate install --codex-hook
```

This writes a project-local Codex `Stop` hook to `.codex/hooks.json`; it runs
`codex-gate run` on each turn and asks Codex to continue when the gate blocks.

## Gate agent PRs in CI

Maintainers can require codex-gate before a human ever reads an AI-generated
PR. Add a workflow and mark it a required status check:

```yaml
on: pull_request
jobs:
  codex-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: PMWang/codex-gate@main
```

The action gates the PR's diff against its title and body. Unlike a local
hook, a required status check is enforced server-side — an agent can't skip
it with `--no-verify`.

## Architecture

The checking logic lives in a tool-agnostic **core** (`src/core`) — the checks
don't care which agent wrote the code. A thin **Codex shell** (`src/codex`)
wraps that core with Codex-native conventions (`AGENTS.md`, CLI integration).
codex-gate is positioned and shipped for Codex; the core stays clean so the
project never paints itself into a corner.

## License

MIT — see [LICENSE](./LICENSE).
