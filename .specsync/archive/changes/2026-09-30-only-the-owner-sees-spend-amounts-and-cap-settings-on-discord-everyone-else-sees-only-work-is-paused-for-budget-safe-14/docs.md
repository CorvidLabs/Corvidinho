---
change: only-the-owner-sees-spend-amounts-and-cap-settings-on-discord-everyone-else-sees-only-work-is-paused-for-budget-safe-14
artifact: docs
---

# Docs

- `docs/discord.md`: the hi list names SAFE-14.a; the `/status` row says the
  24 h spend line is the owner's (others see only "Work is paused for
  budget." while paused); "Questions and owner ping" says a spend-cap post
  quotes no question, the only DMs are the owner's spend details, and the
  collapsed "↑ needs you" ping no longer covers the 80% warning; new
  paragraph "Spend is the owner's (SAFE-14.a, #98)".
- `docs/DISCORD-GO-LIVE.md` E.1: a bullet on the owner's spend DMs (same DM
  rule as the forget card), the failure log line and the owner-only `/status`
  line; the ROLES-CHAT-3 note list no longer names the 80% warning append.
- `docs/DAEMON.md`: a daemon spend-cap ask posts only "Work is paused for
  budget." and its details go to the owner by DM; the `spend.warning` row
  says the bridge DMs the pending warning.
- `docs/BOX-UPDATE.md`: the `/status` check notes the spend line is
  owner-only.
- `specs/discord/discord.spec.md`: files list (`src/discord/spend-dm.ts`,
  `tests/discord.spend-dm.test.ts`), the spend paragraph (exports, DM pass,
  `spendLine(ownerView)`), `appendPostLine` / collapsed-ping wording,
  invariants, a new SAFE-14.a scenario; `specs/discord/testing.md`;
  `specs/agent/agent.spec.md` (`SPEND_PAUSED_TEXT`, `spendPaused`,
  `formatSpendPublicStatusLine`), `specs/agent/testing.md`. Requirements
  through the deltas.
- README, STATUS and `.env.example` say nothing this makes false (the
  `.env.example` line "doctor and Discord `/status` show spend vs the cap"
  stays true for the owner). No CHANGELOG or version edits; no hi edits
  (SAFE-14.a is already captured).
