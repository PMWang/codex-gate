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

## Next (in priority order)

### 1. test-reality
**Catches:** the agent claims tests pass without running them.
**Logic:** when the claim mentions tests OR test files changed, actually run the
project's test command (detect from `package.json` `scripts.test`, `pytest`,
`cargo test`, `go test`) in `repoRoot`. `block` if the command fails or no test
command exists while tests are claimed. Capture and print the real output.
**Notes:** needs a timeout and an opt-out flag (`--no-run`) for sandboxes.

### 2. agents-md
**Catches:** violations of the repo's own `AGENTS.md` rules.
**Logic:** parse the loaded `AGENTS.md` (already in `context.agentsMd`) for
checkable rules. Start with structural ones the repo declares (e.g. "core stays
tool-agnostic" → block if a diff adds a Codex import under `src/core`). Later:
LLM-backed check of the diff against the prose rules, behind the same interface.
**Why moved up:** no free, local, deterministic AGENTS.md-compliance tool exists
anywhere (the only comparable check lives inside a paid, Claude-only product) —
this is an open wedge.

### 3. Codex CLI hooks integration
**What:** ship first-class [Codex CLI hooks](https://developers.openai.com/codex/hooks)
support (hooks are stable since Codex v0.124.0): a documented hook config +
`codex-gate install --codex-hook` that wires codex-gate to run on Codex's
`Stop` event, so every Codex turn is gated automatically before the user even
looks at the diff. Nobody occupies this niche yet; it also makes the README's
Codex-integration story literally true.
**Notes:** lives in `src/codex/` (shell layer), core stays tool-agnostic.

### 4. Ship it: npm publish + GitHub Action
- npm publish (`prepublishOnly` already builds; verify `npx codex-gate` works).
- GitHub Action wrapper positioned as a **required status check for
  agent-generated PRs** ("AI PRs must pass codex-gate before a human looks").
  Server-side checks are the one gate an agent cannot bypass locally
  (documented agent behavior: `--no-verify`, skipping hooks).
- Submit to awesome-codex community lists after publish.

### 5. no-churn (lite)
**Catches:** pointless reformatting / dead code / placeholder work.
**Logic:** flag hunks that are pure whitespace/reformatting (added line equals a
removed line ignoring whitespace); flag added `TODO`/`FIXME`/`pass`/`throw new
Error("not implemented")` with no surrounding logic. `warn` only — adjacent
tools already cover deep churn analysis; this stays a lightweight tripwire.

### 6. Config file
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
