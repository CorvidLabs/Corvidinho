---
change: safe-8-amended-issue-98-warn-at-80-of-the-daily-spend-cap-and-ask-at-100-instead-of-refusing-once-per-crossing-a-run
artifact: context
---

# Context

PR #160 shipped the first SAFE-8 slice (change
`safe-8-daily-spend-cap-issue-98-captured-slice-…`): an optional
`CORVIDINHO_DAILY_SPEND_CAP_USD`, a per-model price table, a `spend_ledger`
in the shared SQLite DB, and a hard refusal of any provider call that would
break the cap. That matched the SAFE-8 wording at the time ("refused").

Leif then decided on #98 (captured in `hi/safe.md` by #162) that SAFE-8 reads:
"When a daily spend cap is set, I get a warning at 80% of it, and at 100% the
agent asks me (an Approve card to continue) instead of refusing or quietly
running up the bill." AUTONOMOUS-8 ("I can see credit/spend usage for
autonomous runs against a budget I set") is unchanged. PR #160 was put on
hold with a review comment asking for the 80% warning and an ask at 100%.

Constraints for a session picking this up:

- The Approve card itself is #96 (draft SAFE-18..20) and is NOT captured, so
  it is not built. The ask path that exists on main is AUTONOMY-1/2 (#163):
  a run can end `blocked` with a `HumanAsk`; Discord posts the question and
  pings the configured owner (`src/discord/ask-ping.ts`), schedules dedupe
  the owner ping per question. This change reuses that path.
- No new slash command, env var or product surface; `/status` and `doctor`
  get a line. Draft SAFE-14..16 (per-provider caps, unknown spend shown as
  unknown) stay left for HI capture.
- The earlier change's ledger, price table and estimates are kept as is; this
  change only modifies REQ-agent-098 / REQ-cli-098 / REQ-discord-098.
- No schema version bump: `spend_alerts` is created with CREATE TABLE IF NOT
  EXISTS in `src/agent/spend.ts`, like `spend_ledger`.
