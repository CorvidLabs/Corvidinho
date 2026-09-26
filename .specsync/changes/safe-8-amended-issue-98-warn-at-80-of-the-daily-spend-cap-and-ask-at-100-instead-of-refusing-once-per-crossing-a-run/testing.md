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
- Full suite: `bun test`, `bunx tsc --noEmit`, `specsync check
  --require-coverage 100`, `fledge lanes run verify --non-interactive`.
