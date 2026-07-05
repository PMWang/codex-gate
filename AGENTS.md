# AGENTS.md — rules for agents working on codex-gate

This repo is maintained with Codex. These rules apply to any agent (and human)
touching the code. codex-gate dogfoods itself: every change should pass
`npm run dev -- run --staged`.

## Hard rules

1. **Your PR description must match your diff.** If you say you added a gate,
   the diff must contain that gate and a test for it. No grand summaries on
   trivial changes.
2. **No unrun claims.** Don't write "tests pass" unless you ran them in this
   change. Paste the command.
3. **No churn.** Don't reformat or "tidy" files you aren't functionally
   changing. Keep diffs minimal and reviewable.
4. **Keep the core tool-agnostic.** Gate logic goes in `src/core` and must not
   import anything Codex-specific. Codex-only behavior lives in `src/codex`.
5. **Every new gate ships with an example** under `examples/` showing a passing
   and a failing case.

## Machine-enforced rules

The `agents-md` gate enforces this block on every gated diff (rule 4 above,
made checkable — see `src/core/gates/agentsMd.ts` for the directive syntax):

```codex-gate
# The tool-agnostic core must not import Codex-specific code.
forbid-import src/core/ codex
```

## Layout

- `src/core/` — tool-agnostic gate engine and gates.
- `src/codex/` — Codex-native shell (AGENTS.md loader, CLI glue).
- `src/cli.ts` — entry point.
