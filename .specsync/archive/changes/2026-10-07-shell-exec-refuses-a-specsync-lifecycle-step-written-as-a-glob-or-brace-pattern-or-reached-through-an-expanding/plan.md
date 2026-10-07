---
change: shell-exec-refuses-a-specsync-lifecycle-step-written-as-a-glob-or-brace-pattern-or-reached-through-an-expanding
artifact: plan
---

# Plan

1. `plugins/shell/clamp.ts`: `Word.glob` in the tokenizer.
2. `plugins/shell/sdd-lifecycle.ts`: `braceWords`, `globToks`,
   `globMatches`, `patternMatch`; `namesSpecsync` / `namesXargs` return
   how a word may name them; `stepAfterChange` refuses a pattern step;
   `invocationStep` gets `strictSub` (expanding / pattern subcommand,
   xargs subcommand); `commandStep` picks the mode and the `fed` sources.
3. Tests in `tests/shell.sdd-lifecycle.test.ts`; fail-on-base proof with
   main's two source files swapped in, plus a per-case run through
   `shell-exec` on the base.
4. Spec prose, REQ-plugins-1818 (modified, full text + two bullets + three
   acceptance criteria), testing evidence.
5. `specsync change approve` → `change check --commit` → `change audit` →
   `specsync check --require-coverage 100` → `hi check` →
   `bunx tsc --noEmit` → `bun test` (twice) →
   `fledge lanes run verify --non-interactive`.
