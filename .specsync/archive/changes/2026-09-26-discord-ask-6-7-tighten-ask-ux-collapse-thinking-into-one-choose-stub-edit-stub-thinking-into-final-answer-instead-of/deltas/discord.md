---
module: discord
change: discord-ask-6-7-tighten-ask-ux-collapse-thinking-into-one-choose-stub-edit-stub-thinking-into-final-answer-instead-of
---

# Delta: discord (DISCORD-ASK-6/7)

## Added

### REQUIREMENT REQ-discord-047

When the bridge posts a button ask (Choose stub + components), it SHALL NOT leave a
separate thinking embed whose primary status is "Needs your input" (or stuck
equivalent) as the public UX. It SHALL prefer a single public Choose stub by
editing the thinking progress message into that stub (clearing the embed) when
`editMessage` is available (DISCORD-ASK-6).

Acceptance Criteria
- Button ask path: one tracked public message with Choose components; no parallel
  "Needs your input" Done embed when collapse succeeds.
- Fallback when editMessage unavailable: prior status embed + separate stub reply.

### REQUIREMENT REQ-discord-048

On successful completion after a button pick, or on a normal successful mention
done, the bridge SHALL prefer editing the existing stub or thinking progress
message into the final answer content instead of posting an extra "✅ Done"
thinking status plus a new reply, when `editMessage` is available (DISCORD-ASK-7).
Ephemeral Choose → options remains unchanged (DISCORD-ASK-1..5).

Acceptance Criteria
- Mention success: progress message becomes the answer body when collapse succeeds.
- Button pick success: stub (reused as thinking) becomes the answer when collapse succeeds.
- Fallback preserves Done embed + separate reply when editMessage is unavailable.
