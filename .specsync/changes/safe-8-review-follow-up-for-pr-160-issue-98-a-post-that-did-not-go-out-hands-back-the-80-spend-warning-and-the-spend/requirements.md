---
change: safe-8-review-follow-up-for-pr-160-issue-98-a-post-that-did-not-go-out-hands-back-the-80-spend-warning-and-the-spend
artifact: requirements
---

# Requirements

SAFE-8 (hi/safe.md, as amended on #98: "I get a warning at 80% of it"),
AUTONOMOUS-8, AUTONOMY-2/4/5/6 (hi/autonomy.md).

- Modified `REQ-agent-098`: a warning claimed while spend is back under 80%
  stays pending (not dropped, no second warning in the crossing) for the
  first post that sees 80% again; `claimCapPing` returns a releasable claim.
- Modified `REQ-discord-098`: every bridge post that did not go out hands
  back both the warning and the cap episode's owner ping (a schedule keeps no
  ping key for an unposted ping); a slash reply that fails still posts the
  owner notice and re-raises; a spend-cap stop is never the session's
  pending ask.
