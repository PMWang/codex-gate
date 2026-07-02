# codex-gate roadmap

Status: **0.1 scaffold + first gate working.** This file specs the remaining
gates. Each gate implements the `Gate` interface in `src/core/gate.ts`, lives in
`src/core/gates/`, registers in `src/core/registry.ts`, and ships with a passing
and a failing example under `examples/`. Keep all gate logic tool-agnostic
(no Codex imports in `src/core`).

## Done

- [x] Engine + `Gate` interface, diff summarizer, registry, CLI (`run`).
- [x] Codex shell: `AGENTS.md` loader.
- [x] **claim-vs-diff** gate — description must match the diff. Catches
      "added tests" with no test file, grand summary on a trivial change,
      "fix" that only touches docs, filenames named but absent from the diff.

## Next (in priority order)

### 1. test-reality
**Catches:** the agent claims tests pass without running them.
**Logic:** when the claim mentions tests OR test files changed, actually run the
project's test command (detect from `package.json` `scripts.test`, `pytest`,
`cargo test`, `go test`) in `repoRoot`. `block` if the command fails or no test
command exists while tests are claimed. Capture and print the real output.
**Notes:** needs a timeout and an opt-out flag (`--no-run`) for sandboxes.

### 2. no-churn
**Catches:** pointless reformatting / dead code / placeholder work.
**Logic:** flag hunks that are pure whitespace/reformatting (added line equals a
removed line ignoring whitespace); flag added `TODO`/`FIXME`/`pass`/`throw new
Error("not implemented")` with no surrounding logic; flag files that are 100%
reordering. `warn` by default, `block` over a configurable churn ratio.

### 3. agents-md
**Catches:** violations of the repo's own `AGENTS.md` rules.
**Logic:** parse the loaded `AGENTS.md` (already in `context.agentsMd`) for
checkable rules. Start with structural ones the repo declares (e.g. "core stays
tool-agnostic" → block if a diff adds a Codex import under `src/core`). Later:
LLM-backed check of the diff against the prose rules, behind the same interface.

### 4. asset-gate
**Catches:** AI-generated images with baked-in text or overlapping labels.
**Logic:** for image files added/changed in the diff, run OCR (detect baked-in
text where the spec says "no text layer") and a pairwise bounding-box overlap
check on declared label regions. `block` on baked text or overlap.
**Notes:** this is our differentiated IP — port the no-baked-text + overlap
gates from the internal image protocol. Heaviest gate; ship last.

## Later

- Config file (`.codex-gate.yml`) to enable/disable gates and set thresholds.
- `codex-gate install` to wire a git pre-commit / pre-push hook.
- Publish to npm; GitHub Action wrapper.
- Optional LLM-backed deep checks (same `Gate` interface, opt-in).
