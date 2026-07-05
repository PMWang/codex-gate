# codex-gate roadmap

Status: **0.1 — scaffold + claim-vs-diff gate hardened.** This file specs the
remaining work in priority order (re-planned 2026-07-05 around the launch
sprint). Each gate implements the `Gate` interface in `src/core/gate.ts`, lives
in `src/core/gates/`, registers in `src/core/registry.ts`, and ships with a
passing and a failing example under `examples/`. Keep all gate logic
tool-agnostic (no Codex imports in `src/core`).

## Done

- [x] Engine + `Gate` interface, diff summarizer, registry, CLI (`run`).
- [x] Codex shell: `AGENTS.md` loader.
- [x] **claim-vs-diff** gate — description must match the diff. Catches
      "added tests" with no test file, grand summary on a trivial change,
      "fix" that only touches docs, filenames named but absent from the diff.
      Hardened: negation-aware ("no tests needed" doesn't trip the block),
      rename/deletion-aware diff parsing, filename whitelist kills prose
      false positives, empty diff short-circuits instead of judging a stale
      commit message.
- [x] **agents-md** gate (structural v1) — enforces the machine-checkable
      rules a repo declares in a fenced ` ```codex-gate ` block inside its
      AGENTS.md (`forbid-import`, `forbid-added`). Dogfooded: this repo's own
      "core stays tool-agnostic" rule is now enforced on every gated diff.
      Prose-rule (LLM-backed) checking stays in Later.
- [x] **Codex CLI hooks integration** — `codex-gate install --codex-hook`
      installs a project-local `Stop` hook in `.codex/hooks.json`; the hook
      feeds Codex's last assistant message into `codex-gate run` and returns a
      Stop continuation when gates block. Default behavior runs tests; use
      `--no-run` only for constrained sandboxes.

## Next (in priority order)

### 1. test-reality
**Catches:** the agent claims tests pass without running them.
**Logic:** when the claim mentions tests OR test files changed, actually run the
project's test command (detect from `package.json` `scripts.test`, `pytest`,
`cargo test`, `go test`) in `repoRoot`. `block` if the command fails or no test
command exists while tests are claimed. Capture and print the real output.
**Notes:** needs a timeout and an opt-out flag (`--no-run`) for sandboxes.

### 2. Ship it: npm publish + GitHub Action
- npm publish (`prepublishOnly` already builds; verify `npx codex-gate` works).
- GitHub Action wrapper positioned as a **required status check for
  agent-generated PRs** ("AI PRs must pass codex-gate before a human looks").
  Server-side checks are the one gate an agent cannot bypass locally
  (documented agent behavior: `--no-verify`, skipping hooks).
- Submit to awesome-codex community lists after publish.

### 3. no-churn (lite)
**Catches:** pointless reformatting / dead code / placeholder work.
**Logic:** flag hunks that are pure whitespace/reformatting (added line equals a
removed line ignoring whitespace); flag added `TODO`/`FIXME`/`pass`/`throw new
Error("not implemented")` with no surrounding logic. `warn` only — adjacent
tools already cover deep churn analysis; this stays a lightweight tripwire.

### 4. Config file
`.codex-gate.yml` — enable/disable gates, set thresholds (e.g. churn ratio,
long-description word count). Minimal: parse, apply, document.

## Later (deliberately after launch)

- **asset-gate** (v0.4, before the Codex-for-Open-Source application):
  OCR / overlap checks on AI-generated images in the diff — no baked-in text
  where the spec says none, no overlapping label regions. Differentiated IP,
  no competitor has it; heaviest dependency footprint, so it ships after the
  core is public.
- `codex-gate install` for plain git pre-commit / pre-push hooks.
- Optional LLM-backed deep checks (same `Gate` interface, strictly opt-in —
  the default stays free, local, deterministic, no API key).

## Non-goals

- No multi-agent orchestration, no review-SaaS ambitions, no dashboard. The
  crowded end of this market is heavyweight platforms; codex-gate wins by
  staying a 5-minute-install, single-purpose gate.
