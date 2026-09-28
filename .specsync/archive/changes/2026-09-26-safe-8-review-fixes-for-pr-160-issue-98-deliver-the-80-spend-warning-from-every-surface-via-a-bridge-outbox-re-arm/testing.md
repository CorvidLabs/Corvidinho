---
change: safe-8-review-fixes-for-pr-160-issue-98-deliver-the-80-spend-warning-from-every-surface-via-a-bridge-outbox-re-arm
artifact: testing
---

# Testing

Fixtures only: mocked fetch, in-memory or temp-file SQLite, a fake gateway,
an injected agent and logger. No network, no real keys, no git worktrees.

- `tests/agent.spend-ask.test.ts`: the reviewer's repro now warns on the
  second crossing; a reservation re-arms; spend between 70% and 80% does not
  re-warn; outbox without DB, without tables, claim / release / moot drop,
  `claimCapPing` episodes (re-arm under 70%, 24 h), migration of an older
  `spend_alerts` table.
- `tests/discord.spend.test.ts`: a WATCH-style guard on a shared DB file
  crosses 80% and the next bridge chat reply pings the owner once; `/work`
  delivers a pending warning as a fresh post; chat asks at the cap ping once
  and never carry the reply hint, re-armed after spend under 70%; `/work`
  at the cap is `blocked`, paused, shows the ask and the PR line, pings once;
  `/session start` at the cap; `replyWithOwnerNotice` fallback; a schedule
  ask in an already-pinged episode has no mention; daemon warn log lines.
