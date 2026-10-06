---
change: it-can-merge-its-own-corvidinho-pr-when-i-ask-and-every-gate-is-green-never-its-gates-never-someone-else-s-github-7
artifact: plan
---

# Plan

1. Capture GITHUB-7.a with `hi` (own commit); `hi check`.
2. `src/plugins/types.ts` / `must-ask.ts`: the `merge` class and
   `mustask-merge` card kind; `auditDenied`.
3. `src/plugins/run.ts`: `<command>:<reason>` denied rows.
4. `plugins/github/merge.ts` + registration in `plugins/github/index.ts`.
5. `src/agent/tools.ts` / `execute.ts`: the self-merge grant; `loop-guards.ts`,
   `events-ndjson.ts`, `ask.ts`.
6. `tests/github.self-merge.test.ts` (fake GitHub client); boundary test
   list; fail-on-base proof.
7. Docs, spec prose, deltas, module testing evidence.
8. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
