---
change: autonomy-4-7-clarify-pings-requester-thin-ack-restates-pending-ask-cancel-clears-joke-impossible-witty-decline-package
artifact: plan
---

# Plan

1. Capture HI AUTONOMY-4..7 in `hi/autonomy.md`.
2. Extend `formatAskReply` with `requesterDiscordId`; update bridge + scheduler.
3. Add durable `pendingAsk` on sessions (schema v8) + thin-ack/cancel detectors.
4. Bridge continue path: thin → restate; cancel → clear; else answer context.
5. AUTONOMY-7 line in `ASK_AGENT_SYSTEM_INSTRUCTIONS`.
6. Tests, bump 0.0.20, CHANGELOG, SpecSync check + fledge verify, PR, merge, tag, restart bridge.
