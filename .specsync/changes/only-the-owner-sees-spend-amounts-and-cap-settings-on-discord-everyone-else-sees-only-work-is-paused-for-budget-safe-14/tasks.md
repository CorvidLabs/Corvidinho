---
change: only-the-owner-sees-spend-amounts-and-cap-settings-on-discord-everyone-else-sees-only-work-is-paused-for-budget-safe-14
artifact: tasks
---

# Tasks

- [x] Confirm SAFE-14.a and DISCORD-15.a are already captured on main (no new `hi` capture); `hi check` passes.
- [x] Research: every Discord surface that showed spend amounts or cap settings, and the DM path.
- [x] `src/agent/spend-notice.ts`: `SPEND_PAUSED_TEXT`, `SPEND_CAP_SUMMARY`, `spendPaused`, `formatSpendPublicStatusLine`.
- [x] `src/discord/ask-ping.ts`, `src/discord/spend-post.ts`: generic headline, status and owner notice; no question quote; no warning line; `withSpendWarningPost` / `formatSpendWarningReply` removed.
- [x] `src/discord/spend-dm.ts`: owner DMs for the 80% warning and a cap stop's details, retried every pass, logged once per streak.
- [x] Wire the DM pass and the owner-only `/status` line (`bridge.ts`, `slash-types.ts`, `command-handlers/status.ts`, `work.ts`, `session.ts`, `scheduler/service.ts`).
- [x] Tests: flip the leak-asserting tests (`discord.spend`, `discord.rich-replies`, `discord.collapsed-ping`, `scheduler.ask-outbox`, `discord.slash-pending-ask`, `docs.operator-facts`); new `tests/discord.spend-dm.test.ts`.
- [x] Fail-on-base proof (base sources swapped in: 29 fail, the new file cannot load; restored: all pass); DISCORD-15.a footer tests green.
- [x] Docs: `docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `docs/DAEMON.md`, `docs/BOX-UPDATE.md`.
- [x] Spec: deltas (REQ-discord-098, 215, 347, 734, 071 and REQ-agent-098 Modified), `discord.spec.md` / `agent.spec.md` prose and files list, scenario, both `testing.md` files.
- [x] SpecSync approve / check / audit, coverage, `hi check`, tsc, `bun test`, fledge verify.
