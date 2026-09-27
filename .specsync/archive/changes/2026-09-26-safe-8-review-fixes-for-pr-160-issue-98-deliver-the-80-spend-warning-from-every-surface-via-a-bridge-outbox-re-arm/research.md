---
change: safe-8-review-fixes-for-pr-160-issue-98-deliver-the-80-spend-warning-from-every-surface-via-a-bridge-outbox-re-arm
artifact: research
---

# Research

- Only the Discord bridge knows the owner and can post; WATCH posts to
  GitHub, the daemon has no outbound, delegate workers report to a lead.
  Passing `result.spendWarning` through every consumer would still lose the
  warnings of WATCH and the daemon, so the runner records and the bridge
  delivers (claimed in SQLite, like the ledger reservation).
- Re-arming exactly at 80% would warn on almost every call when spend
  hovers there (old calls leave the window, new ones arrive); a 70% re-arm
  level avoids that while still catching a real second crossing. Re-arm
  rows are per cap value so a process with a larger cap cannot re-arm a
  smaller one.
- A slash command answers by editing its deferred reply; mentions added in
  an edit may not notify, so the owner notice is a fresh channel post via
  the gateway reply (allowed mentions limited to the owner).
- WATCH's GitHub summary comes from `TaskResult.summary`; making the
  runner's summary at the cap generic keeps amounts and env names off
  public comments without touching the watch module.
