# codex-gate

**A quality gate that keeps Codex honest.**

`codex-gate` inspects the changes an AI coding agent produces — *before* they get
committed or merged — and blocks the classic failure modes of agent output:
descriptions that don't match the diff, tests that were "passed" but never run,
churn that changes nothing, and rules the agent was told to follow but didn't.

It is built for the [OpenAI Codex](https://openai.com/codex/) workflow: it reads
your repo's `AGENTS.md`, plugs into the Codex CLI loop, and can run as a
pre-merge check in CI.

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
| _test-reality_ (planned) | Re-runs the tests instead of trusting "all green". |
| _no-churn_ (planned) | Pointless refactors, dead code, `TODO` placeholders. |
| _agents-md_ (planned) | Enforces the rules in this repo's `AGENTS.md`. |
| _asset-gate_ (planned) | OCR / overlap checks on generated images (no baked-in text, no overlapping labels). |

## Quick start

```bash
npm install
npm run dev -- run --staged          # gate your staged changes + last commit msg
npm run dev -- run --diff change.patch --claim message.txt
```

Exit code is non-zero if any gate **blocks**, so it drops straight into CI or a
git hook.

## Architecture

The checking logic lives in a tool-agnostic **core** (`src/core`) — the checks
don't care which agent wrote the code. A thin **Codex shell** (`src/codex`)
wraps that core with Codex-native conventions (`AGENTS.md`, CLI integration).
codex-gate is positioned and shipped for Codex; the core stays clean so the
project never paints itself into a corner.

## License

MIT — see [LICENSE](./LICENSE).
