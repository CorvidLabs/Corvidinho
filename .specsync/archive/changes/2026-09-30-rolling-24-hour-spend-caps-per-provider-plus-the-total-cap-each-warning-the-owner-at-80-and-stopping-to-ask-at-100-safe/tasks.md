---
change: rolling-24-hour-spend-caps-per-provider-plus-the-total-cap-each-warning-the-owner-at-80-and-stopping-to-ask-at-100-safe
artifact: tasks
---

# Tasks

- [x] Confirm SAFE-14 and SAFE-15 are already captured on main (no new `hi` capture); `hi check` passes.
- [x] Research: provider id vs ledger provider, alert state, ping claims, schedule ask persistence, #325's fallback handling of `SpendCapRefusal`.
- [x] `src/agent/spend.ts`: `parseSpendCaps` / `parseProviderCapList` / `configuredProviderIds`, `window(now, provider?)` + index, two-cap `reserve` with `trips`, per-provider `noteWarning`, guard, snapshot, `spendDoctorChecks`.
- [x] `src/agent/spend-alerts.ts` and `spend-outbox.ts`: per-scope state, `scope` column by ALTER, one warning per cap, per-scope ping claims.
- [x] `src/agent/spend-notice.ts`, `types.ts`, `ask.ts`, `index.ts`: scope helpers, asks with the marker, per-cap lines, `spendScopes`.
- [x] `src/discord/spend-post.ts`, `ask-ping.ts`, `spend-dm.ts`; `src/store/scrub.ts`; `src/cli.ts` doctor + help; `.env.example`; test preload + probe.
- [x] Tests: new `tests/agent.spend-caps.test.ts` (24), updated `tests/agent.spend.test.ts`, `tests/agent.spend-ask.test.ts`, `tests/preload.operator-data-dir.test.ts`.
- [x] Fail-on-base proof (main's sources swapped in: the new file cannot load, 3 updated tests fail, a provider-cap probe sends the call; restored: all pass).
- [x] Rebased onto 7090656 (#325); spend and `tests/agent.fallback.test.ts` green.
- [x] Docs: `docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `docs/DAEMON.md`, `docs/BOX-UPDATE.md`.
- [x] Spec: deltas (REQ-agent-114 Added; REQ-agent-098, REQ-cli-098, REQ-cli-262, REQ-discord-098 Modified), spec prose and files lists, testing notes.
- [x] SpecSync approve / check / audit, coverage, `hi check`, tsc, `bun test`, fledge verify.
