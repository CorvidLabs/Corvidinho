---
change: safe-8-review-fixes-for-pr-160-issue-98-deliver-the-80-spend-warning-from-every-surface-via-a-bridge-outbox-re-arm
artifact: context
---

# Context

PR #160 (issue #98) implements SAFE-8 as amended ("I get a warning at 80% of
it, and at 100% the agent asks me (an Approve card to continue) instead of
refusing or quietly running up the bill") through two changes:
`safe-8-daily-spend-cap-issue-98-captured-slice-…` (ledger, prices, cap) and
`safe-8-amended-issue-98-warn-at-80-…` (warn at 80%, ask at 100%).

A review of PR #160 found:

1. (major) The 80% warning was deduped globally but shown only by Discord
   chat replies and bridge schedule posts. A crossing made by WATCH,
   `/work`, `/session start`, a delegate worker, the daemon or a schedule
   whose channel left the allowlist recorded the warning and silently used
   it up for 24 h.
2. (minor) `/work` and `/session start` ignored `result.ask`: a spend-cap
   stop showed "✅ Done", `/work` was stored `completed`, and the owner was
   not pinged. WATCH posted the ask text (amounts, env var name, restart
   hint) publicly on GitHub; the daemon told no one.
3. (minor) The chat ask ended with "Do you want to raise the cap?" and a
   "Reply to this message" hint although a reply cannot lift the cap, and
   every chat message at the cap pinged the owner.
4. (minor) "Once per crossing" was really "at most once per cap value per
   24 h": a second crossing inside 24 h stayed silent.

Constraints: the canonical requirement text for these fixes is carried by
the amended change's deltas (REQ-agent-098, REQ-discord-098, REQ-cli-098);
this change covers the implementation paths that change did not list. No new
env var, slash command or schema version; the Approve card (#96, draft
SAFE-18..20) stays left for HI capture.
