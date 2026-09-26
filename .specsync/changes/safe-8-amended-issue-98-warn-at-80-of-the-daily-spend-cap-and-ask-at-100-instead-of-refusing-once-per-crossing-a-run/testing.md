---
change: safe-8-amended-issue-98-warn-at-80-of-the-daily-spend-cap-and-ask-at-100-instead-of-refusing-once-per-crossing-a-run
artifact: testing
---

# Testing

All fixtures: mocked fetch, a localhost mock LLM (`Bun.serve` on
127.0.0.1), a fake gateway, a fake `sh` bin for the spawn client, in-memory
or temp-dir SQLite. No network, no real keys, no git worktrees.

- `tests/agent.spend.test.ts` (updated): the cap stop now carries a
  `spend-cap` ask with spend vs cap and how to continue; unpriced / invalid
  still stop before the ledger or fetch; `createTaskExecute` at a zero cap
  returns the ask on every attempt; doctor prints `info` without a cap and
  the percent with one.
- `tests/agent.spend-ask.test.ts` (new): `noteWarning` fires once at 80%,
  stays quiet on repeats, re-arms on a new cap and after 24 h, never for a
  zero cap, and once across two connections on one file; the guard fires
  `onWarning` once on the crossing call and records nothing without a
  listener; `finish` swaps the result once and keeps `filesChanged`;
  `runTask` ends `blocked` (verify runner never called, no fetch);
  `createTaskExecute` emits exactly one `Text` warning; notice formatting,
  validation and scrubbing; `readSpendSnapshot` never throws; `task run
  --json` against the localhost mock carries `result.spendWarning` on the
  crossing run only and returns `blocked` with a `spend-cap` ask at the cap
  without hitting the mock.
- `tests/discord.spend.test.ts` (new): spend-cap ask headline / status /
  owner ping; stable `askPingKey`; warning line + mention merge + length cut;
  bridge reply for a spend-cap ask (status not an error) and for a warning;
  `/status` shows 24 h spend vs cap from the bridge DB; spawn client keeps a
  valid `spendWarning` and drops a malformed one; scheduler post carries the
  warning and pings the owner.
- Review round (PR #160 review):
  - `tests/agent.spend-ask.test.ts`: the reviewer's repro ($0.90 at T0-23h
    warns at T0; at T0+2h the window is $0 and a check re-arms; $0.85 then
    warns again), the reservation re-arms too, spend hovering between 70%
    and 80% does not re-warn; the outbox (no DB → run's warning; a DB
    without spend tables is left alone; a recorded warning is claimed once
    with current spend, released and re-taken, dropped when moot;
    `claimCapPing` once per episode, re-armed under 70% or after 24 h; an
    older `spend_alerts` table gains `delivered_at`); ask questions have no
    `?` and end with the operator note; summary at the cap is
    `SPEND_CAP_SUMMARY`; `task run --output text` at the cap prints the
    summary and the question.
  - `tests/discord.spend.test.ts`: a WATCH-style guard on a shared DB file
    crosses 80% (its `onWarning` ignored) and the next bridge chat reply
    carries the warning with the owner pinged, once; `/work` delivers a
    pending warning as a fresh post; two chat asks at the cap ping once, no
    reply hint, re-armed after a reservation under 70%; `/work` at the cap
    is `blocked`, paused, shows the ask and the spend-cap PR line, pings the
    owner once in a fresh post and not again; `/session start` at the cap;
    `replyWithOwnerNotice` falls back to the reply; a schedule ask in an
    already-pinged episode posts without a mention; the daemon logs
    `spend.warning` and `run.needs_human`; a thin reply to a spend-cap ask
    restates it without a mention or agent run; a `/work` clarify ask
    addresses the requester with no owner post (AUTONOMY-4).
- Full suite: `bun test`, `bunx tsc --noEmit`, `specsync check
  --require-coverage 100`, `fledge lanes run verify --non-interactive`.
