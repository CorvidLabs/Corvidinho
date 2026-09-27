---
change: safe-8-review-follow-up-for-pr-160-issue-98-a-post-that-did-not-go-out-hands-back-the-80-spend-warning-and-the-spend
artifact: context
---

# Context

A read-only blocker review of the PR #160 fix commits (head f491d0c, SAFE-8
as amended on #98) found that the new spend alert outbox could lose what it
had claimed:

1. (major) `/work` and `/session start` claimed the pending 80% warning and
   the spend-cap owner ping (`slashOwnerNotice`) and then sent the reply
   first; when that reply threw — e.g. an interaction token that expired
   during a run longer than 15 minutes, exactly the long runs that cross
   80% — the owner notice was never posted and nothing handed the claims
   back. Reproduced: the warning stayed marked delivered, no post went out.
2. (major) `takeWarning` claimed pending warnings and then dropped them when
   current spend was back under 80%, without re-arming (re-arm needs < 70%).
   80% at T0 (WATCH / daemon, nobody told) → 72% (a bridge post drops it) →
   96%: `noteWarning` stayed disarmed, so the owner never got an 80% warning
   for that crossing — the first notice was the 100% ask.
3. (minor) The spend-cap owner ping was claimed before the chat reply,
   schedule post or slash notice and never handed back when that post failed,
   silencing the ping for up to 24 h.
4. (minor) A spend-cap stop was stored as the session `pendingAsk`: after the
   cap was lifted a thin "ok" restated the stale cap ask instead of running,
   and a substantive reply injected the cap text into the prompt as
   "[Prior clarifying question…]".

Decided by the coordinator: amounts and env names in non-owner Discord
replies (the reviewer's finding 1) are not a blocker — REQ-discord-098
specifies that behaviour and it goes to Leif separately; this change leaves
it as is.

Constraints: the canonical text lives in REQ-agent-098 and REQ-discord-098
(Modified here with the full existing text plus new acceptance bullets). No
new env var, slash command or schema version; `spend_alerts` still holds only
constant kinds and integers. AUTONOMY-5/6 (#189) stays unchanged for clarify
and stuck asks.
