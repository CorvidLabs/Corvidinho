---
change: only-the-owner-sees-spend-amounts-and-cap-settings-on-discord-everyone-else-sees-only-work-is-paused-for-budget-safe-14
artifact: plan
---

# Plan

1. Confirm SAFE-14.a and DISCORD-15.a are on main (`hi/safe.md`,
   `hi/discord.md`); capture nothing new.
2. Research every Discord surface that shows spend (chat, pick, `/work`,
   `/session start`, schedule posts, the daemon pending-ask pass, `/status`,
   footers) and the DM path (`sendDm`).
3. `spend-notice.ts`: generic text, public status line.
4. `ask-ping.ts` / `spend-post.ts`: generic headline / status / notice, no
   question quote, no warning line.
5. New `spend-dm.ts`; wire it in `bridge.ts`, `work.ts`, `session.ts`,
   `scheduler/service.ts`; owner-only `/status` spend line.
6. Flip the tests that asserted the leaks; add `tests/discord.spend-dm.test.ts`;
   prove they fail on base and pass on the branch; keep the DISCORD-15.a
   footer tests green.
7. Docs (`docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `docs/DAEMON.md`,
   `docs/BOX-UPDATE.md`), spec prose, testing notes, deltas (REQ-discord-098,
   215, 347, 734, 071; REQ-agent-098).
8. Approve, `change check --commit`, audit, coverage, `hi check`, tsc,
   `bun test`, fledge verify.
