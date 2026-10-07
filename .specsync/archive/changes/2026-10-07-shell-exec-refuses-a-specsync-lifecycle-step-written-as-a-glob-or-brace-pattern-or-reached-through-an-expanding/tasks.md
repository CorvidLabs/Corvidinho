---
change: shell-exec-refuses-a-specsync-lifecycle-step-written-as-a-glob-or-brace-pattern-or-reached-through-an-expanding
artifact: tasks
---

# Tasks

- [x] Tokenizer: `Word.glob` for an unquoted `*`, `?`, `[`, `{` (`plugins/shell/clamp.ts`).
- [x] `sdd-lifecycle.ts`: pattern reading (brace words, glob matcher) for `specsync`, `change`, the steps and `xargs`.
- [x] `sdd-lifecycle.ts`: an expanding or pattern subcommand and an xargs-supplied subcommand fail closed, outside expanding command words and never-run commands.
- [x] `tests/shell.sdd-lifecycle.test.ts`: 3 tests (shell-exec patterns, shell-exec expanding / xargs subcommands, `firstLifecycleStep` unit cases and non-refusals); fail-on-base proof.
- [x] Spec prose (`plugins.spec.md`), REQ-plugins-1818 (modified), module testing evidence.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
- [x] Review: brace patterns split into bash's words (empty ones dropped, past the caps any words); `xargs` replace strings read as getopt reads them, including a `-c` script they fill in; an expanding directory before a literal `specsync` basename; `[` on the never-run list; 1 test with fail-on-first-head proof; REQ-plugins-1818, spec prose, residuals and evidence updated.
