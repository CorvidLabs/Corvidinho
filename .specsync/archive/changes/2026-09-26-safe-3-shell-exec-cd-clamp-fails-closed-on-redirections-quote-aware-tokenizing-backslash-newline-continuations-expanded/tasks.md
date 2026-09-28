---
change: safe-3-shell-exec-cd-clamp-fails-closed-on-redirections-quote-aware-tokenizing-backslash-newline-continuations-expanded
artifact: tasks
---

# Tasks

- [x] Rewrite `plugins/shell/clamp.ts` around a quote-aware tokenizer: join
      backslash-newline continuations; split fragments only on unquoted control
      operators; drop redirections (with `fd` prefix and `>&`/`&>`) and their
      targets; skip `cd`/`pushd` options; track word expansion.
- [x] Refuse expanded command words, `cd -`, expanded/escaping targets, glob /
      brace targets, and `DIRSTACK` writes; fix the `NAME+=` assignment prefix.
- [x] Re-parse `eval`'s literal argument and analyse command-substitution
      bodies (`$(…)`, backticks) recursively.
- [x] Move CDPATH defence to the child shell (`CDPATH=; readonly CDPATH`) in
      `plugins/shell/commands.ts`; drop the lexical CDPATH refusal; keep the
      `CDPATH`/`OLDPWD` env drop.
- [x] Add `tests/shell.clamp-failclosed.test.ts` (unit + e2e) covering every
      reviewed form and in-root allow cases; update the two CDPATH lexical
      assertions in `tests/shell.clamp-bypass.test.ts`.
- [x] Update `specs/plugins/requirements.md` REQ-plugins-087 and
      `specs/plugins/plugins.spec.md` (prose, coverage-table row, file list,
      changelog) to match; verify tsc, bun test, SpecSync and verify lane.

