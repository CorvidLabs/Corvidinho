---
change: only-the-owner-sees-spend-amounts-and-cap-settings-on-discord-everyone-else-sees-only-work-is-paused-for-budget-safe-14
artifact: design
---

# Design

- `src/agent/spend-notice.ts`: `SPEND_PAUSED_TEXT` "Work is paused for
  budget."; `SPEND_CAP_SUMMARY` is that text; `spendPaused(snapshot)` and
  `formatSpendPublicStatusLine(snapshot)` for the public `/status` line (only
  while runs stop at the spend check). Doc comments in `spend-outbox.ts` /
  `spend-alerts.ts` say the bridge delivers by DM; no behaviour change there.
- `src/discord/ask-ping.ts`: `SPEND_CAP_HEADLINE` "💸 Work is paused for
  budget.", `SPEND_CAP_STATUS` "💸 Work is paused for budget";
  `formatAskReply` does not quote a spend-cap ask's question (every caller —
  chat, pick, `/work`, `/session start`, `postOwnRunAsk`, `deliverPendingAsks`
  — goes through it). `formatSpendWarningReply` and `withSpendWarningPost`
  are removed (no caller left).
- `src/discord/spend-post.ts`: `ownerAskNoticeLine` spend-cap line
  "💸 <@owner> <label>: Work is paused for budget."; `slashOwnerNotice` drops
  the `outbox` / `spendWarning` inputs and the warning line. The DISCORD-16
  split and holder-part mention logic (`postAnswerParts`,
  `finishSlashWithOwnerNotice` at `DISCORD_ANSWER_MAX`) are untouched; the
  SAFE-13 line still uses them.
- `src/discord/spend-dm.ts` (new): `createSpendDm({ outbox, owner, sendDm,
  log })` → `deliver({ stop?, warning? })`, one pass at a time, never
  rejects. It DMs the owner the held stop's details (`formatSpendStopDm`:
  head, channel, scrubbed / defanged question) and the warning from
  `takeSpendWarning` (outbox, else the run's own), rebuilt with
  `formatSpendWarningLine`. A failed DM releases the warning to the outbox and
  keeps the stop held (newest wins); failures log once per streak (fixed
  text, no amounts). No owner or no DM path claims nothing.
  `spendStopFor(ask, askOwner, channelId)` hands a stop over only when that
  post claimed the episode's owner ping, so the owner gets one DM per cap
  episode, as one ping.
- `src/discord/bridge.ts`: builds `spendDm` next to the forget cards (same
  `sendDmRef`); the chat and pick paths no longer take the warning and call
  `spendDm.deliver({ stop, warning })` in the post's `finally`;
  `SlashContext.spendDm` and `SchedulerServiceOpts.spendDm`;
  `spendLine(ownerView)` returns the owner line (with a "spend DM waiting"
  note) or the public line.
- `src/discord/command-handlers/status.ts`: re-checks ADMIN
  (`resolvePermissionLevel`, owner-only per IDENTITY-2) and passes it to
  `spendLine`. `work.ts` / `session.ts`: new PR line, notice without the
  warning, DM pass in `finally` (runs even when the interaction expired).
- `src/scheduler/service.ts`: new `spendDm` option (not `onTick`, which #313
  changes); every tick `void spendDm.deliver()`; a run's `deliver({ warning })`
  after its posts; `postRunAsk` hands the stop over when it claimed the ping;
  no `withSpendWarningPost`.
- No env var, config key, table, column or schema version; no /admin knob
  (round 10: spend caps stay env/config).

Design choices pending Leif (conservative defaults from
/home/user/coord/m34-defaults.md, slice spend-caps, where one applies):

1. The owner's own run in a shared channel: the 80% warning goes by DM too,
   never on the owner's answer (default "the warning goes by DM only").
2. DMs closed / failing: the claim is kept and retried every tick, the bridge
   logs once per failure streak, the owner's `/status` spend line says a
   spend DM is waiting, and the channel still gets the generic owner ping for
   cap stops (default). `doctor` shows the past-80% / cap-reached state it
   already showed; no new doctor line (cli module untouched).
3. The cap stop's DM carries the run's own spend-cap question (spend, the
   call's estimate, the cap, the setting), scrubbed and defanged, once per
   cap episode tied to the channel ping; a stop whose DM failed is held in
   memory only (a bridge restart loses it; the owner still has the ping,
   `/status` and doctor). Durable `stop` rows built from integers are
   spend-caps-b.
4. Non-owner `/status`: no spend line at all under the cap; "Spend: Work is
   paused for budget." while runs stop at the spend check — cap reached, an
   unpriced model, an invalid cap value or an unreadable ledger (all stop
   runs); a tier-only unpriced model also shows it.
5. The public wording is exactly "Work is paused for budget." everywhere
   (headline with 💸, status without the period, `/work` PR line, the slash
   owner notice after the label); WATCH comments and `SPEND_CAP_SUMMARY` say
   the same.
