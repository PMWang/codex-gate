# codex-gate roadmap

Status: **0.2-dev — four gates live (claim-vs-diff, agents-md, test-reality,
no-churn), minimal config, plus native Codex Stop-hook integration.** This file specs the remaining work
in priority order (re-planned 2026-07-05 around the launch sprint). Each gate implements the `Gate` interface in `src/core/gate.ts`, lives
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
- [x] **test-reality** gate — a claim that tests pass is verified by actually
      rerunning the repository's test command (npm / pytest / cargo / go
      detection, 120s timeout, bounded output tail, `--no-run` escape hatch
      for sandboxes). Written by Codex via the collab bridge; its own delivery
      commit was gated by codex-gate — the loop the project exists to prove.
- [x] **Codex CLI hooks integration** — `codex-gate install --codex-hook`
      installs a project-local `Stop` hook in `.codex/hooks.json`; the hook
      feeds Codex's last assistant message into `codex-gate run` and returns a
      Stop continuation when gates block. Default behavior runs tests; use
      `--no-run` only for constrained sandboxes.
- [x] **no-churn (lite)** — warns on pure formatting hunks and added
      placeholders (`TODO`/`FIXME`, bare Python `pass`, not-implemented throws).
      This is a lightweight tripwire only; deep churn analysis stays out of
      scope.
- [x] **Config file** — optional `.codex-gate.yml` supports gate on/off switches
      and numeric thresholds for claim-vs-diff long-description words and
      test-reality timeout.

## Next (in priority order)

### 1. Ship it: npm publish + GitHub Action
- npm publish (`prepublishOnly` already builds; verify `npx codex-gate` works).
- GitHub Action wrapper positioned as a **required status check for
  agent-generated PRs** ("AI PRs must pass codex-gate before a human looks").
  Server-side checks are the one gate an agent cannot bypass locally
  (documented agent behavior: `--no-verify`, skipping hooks).
- Submit to awesome-codex community lists after publish.

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
