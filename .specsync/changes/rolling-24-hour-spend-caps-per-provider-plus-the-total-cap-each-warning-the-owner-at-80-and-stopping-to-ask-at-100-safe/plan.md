---
change: rolling-24-hour-spend-caps-per-provider-plus-the-total-cap-each-warning-the-owner-at-80-and-stopping-to-ask-at-100-safe
artifact: plan
---

# Plan

1. Confirm SAFE-14 / SAFE-15 (and SAFE-14.a, SAFE-16) are on main; capture
   nothing new; `hi check` passes.
2. Read issue #98 and its rollup, the interview record, pr-spend-caps-b and
   the m34 spend-caps defaults.
3. Setting and ledger (`spend.ts`): parse, validate against configured
   provider ids, per-provider window + index, two-cap reserve with `trips`.
4. Alerts and outbox per scope (`spend-alerts.ts`, `spend-outbox.ts`),
   `scope` column by ALTER, scrub target, re-scrub tolerance.
5. Asks, warnings, doctor and status text (`spend-notice.ts`), ask scopes
   (`types.ts`, `ask.ts`), per-cap pings and keys (`spend-post.ts`,
   `ask-ping.ts`), DM lines (`spend-dm.ts`), doctor wiring and help
   (`cli.ts`), `.env.example`, test preload.
6. Tests (`tests/agent.spend-caps.test.ts`, two updated assertions, the
   preload probe); prove they fail on base and pass on the branch.
7. Rebase onto 7090656 (#325 landed); re-run the spend and fallback tests.
8. Docs, spec prose, testing notes, deltas; approve, check, audit, coverage,
   `hi check`, tsc, `bun test`, fledge verify.
