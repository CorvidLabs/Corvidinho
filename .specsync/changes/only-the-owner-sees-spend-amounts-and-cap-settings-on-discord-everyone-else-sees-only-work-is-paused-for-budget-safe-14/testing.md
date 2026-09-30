---
change: only-the-owner-sees-spend-amounts-and-cap-settings-on-discord-everyone-else-sees-only-work-is-paused-for-budget-safe-14
artifact: testing
---

# Testing

Fixture tests only: `startBridge` with a null gateway whose `reply` and
`sendDm` are recorded, in-memory or temp SQLite, fake thinking outbound,
injected agents; no live Discord, no network, no token.

Flipped (they asserted the leaks) — `tests/discord.spend.test.ts`:

- `formatAskReply` on a spend-cap ask is one line, "💸 Work is paused for
  budget." plus the owner mention: no question, `$`, `%`, `CORVIDINHO_`,
  "daily cap" or "SAFE-8"; status "💸 Work is paused for budget".
- Chat spend-cap stop (fallback reply, collapsed edit, edit + reply failing),
  button-pick resume, `/work` (body, PR line "PR: not opened — Work is paused
  for budget.", owner notice "💸 <@owner> /work `…`: Work is paused for
  budget."), `/session start`: no spend detail in any post; the owner gets the
  details by DM once per cap episode (again after a re-arm or a handed-back
  ping), also when the interaction token expired or the post failed.
- 80% warning: a chat answer, a collapsed edit, `/work`, a schedule ✅ post
  and a WATCH-recorded warning carry no warning line and ping nobody; the
  owner gets the warning by DM, once.
- `/status`: the owner sees "Spend (24h): $4.10 of $5.00 daily cap (82%) —
  ⚠️ past 80%", then "$5.10 … (102%) — 🛑 cap reached", and "Spend cap: off
  (set CORVIDINHO_DAILY_SPEND_CAP_USD …)" with no cap; a declared team member
  sees no spend line under the cap or with none set, and "Spend: Work is
  paused for budget." at the cap.
- `appendPostLine` keeps a closing role note ahead of an appended owner
  notice line (REQ-discord-734).

Flipped elsewhere: `tests/discord.rich-replies.test.ts` (a split fallback
answer to someone else with a warning is the answer alone, split as before,
footer model and time only — DISCORD-15.a — and the owner is DMed);
`tests/discord.collapsed-ping.test.ts` (a clarify with a pending warning pings
only the requester; the owner-as-requester clarify gets the question's ping
and a DM; `/work` at the cap: the notice has no warning, two DMs);
`tests/scheduler.ask-outbox.test.ts` (the daemon pending-ask post is the
schedule line and "💸 Work is paused for budget." with the owner ping, no
question or warning; the stored question is handed to the DM pass once per
episode; every tick runs the pass); `tests/discord.slash-pending-ask.test.ts`
(the slash answers at the cap say "Work is paused for budget.", never "Daily
spend cap reached"); `tests/docs.operator-facts.test.ts` (the `/status` row
says the spend line is the owner's).

New — `tests/discord.spend-dm.test.ts`: `SPEND_PAUSED_TEXT` /
`SPEND_CAP_SUMMARY`, `formatSpendPublicStatusLine` / `spendPaused` for every
snapshot kind, `formatSpendStopDm` (head, channel, scrubbed and defanged
question), `spendStopFor`, and `createSpendDm`: the warning DMed once with
current amounts, the run's own warning without a DB, a DM that returns null
or throws keeps its claim and is sent on the next pass, the failure logged
once per streak without amounts, `waiting()`, the newest held stop wins, no
owner / no DM path claims nothing, concurrent passes send a held stop once.

DISCORD-15.a unchanged: the footer tests in `tests/discord.rich-replies.test.ts`
("anyone else's run shows model and time only, never amounts", "the owner's
run shows tokens and the priced cost", "the live status shows token use on
the owner's runs only") pass untouched.

Fail-on-base proof: with `origin/main`'s (f687a5a)
`src/agent/{index,spend-alerts,spend-notice,spend-outbox}.ts`,
`src/discord/{ask-ping,bridge,slash-types,spend-post}.ts`,
`src/discord/command-handlers/{session,status,work}.ts`,
`src/scheduler/service.ts` and `docs/discord.md` swapped in and
`src/discord/spend-dm.ts` removed, 29 tests in the six existing files fail on
their assertions (21 in `discord.spend`, 1 in `discord.rich-replies`, 3 in
`discord.collapsed-ping`, 2 in `discord.slash-pending-ask`, 1 in
`scheduler.ask-outbox`, 1 in `docs.operator-facts`) and
`tests/discord.spend-dm.test.ts` cannot load (the module is new); with the
branch sources restored all tests in the seven files pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-098` | `tests/discord.spend.test.ts`, `tests/discord.spend-dm.test.ts`, `tests/discord.rich-replies.test.ts`, `tests/discord.slash-pending-ask.test.ts`, `tests/docs.operator-facts.test.ts` | Every spend-cap post (chat, pick, `/work`, `/session start`, schedule) says only "💸 Work is paused for budget." with no question or amount; PR line and owner notice generic; the owner gets the stop's details and the 80% warning by DM (once per episode / once per warning, retried after a failure, logged once per streak); `/status` spend line owner-only, "Spend: Work is paused for budget." for others at the cap; DISCORD-15.a footers unchanged. Fails on the base source. |
| `REQ-discord-215` | `tests/discord.collapsed-ping.test.ts`, `tests/discord.spend.test.ts` | A collapsed answer with a pending warning carries no warning and pings only whoever the answer mentions; `/work` at the cap: one owner notice without the warning; owner-as-requester clarify: only the question's ping. Fails on the base source. |
| `REQ-discord-347` | `tests/scheduler.ask-outbox.test.ts` | The daemon spend-cap ask posts the schedule line and "💸 Work is paused for budget." (no question, no warning, no reply hint), pings the owner once per episode and hands the stored question to the owner's DM pass once. Fails on the base source. |
| `REQ-discord-734` | `tests/discord.spend.test.ts` | "the cut for an appended line keeps a closing role note": 1900-char post ending `y…`, the note and the appended owner notice line; a body that fits is untouched. |
| `REQ-discord-071` | `tests/discord.rich-replies.test.ts`, `tests/safe.injection.test.ts` | The SAFE-13 line still rides the answer and pings the owner on the part that holds it (split semantics unchanged); no SAFE-8 warning shares the post. |
| `REQ-agent-098` | `tests/discord.spend-dm.test.ts`, `tests/agent.spend-ask.test.ts`, `tests/agent.spend.test.ts` | `SPEND_CAP_SUMMARY` is "Work is paused for budget." (no `$`, no `CORVIDINHO_`); `formatSpendPublicStatusLine` only while paused, naming nothing; the question keeps the details. |
