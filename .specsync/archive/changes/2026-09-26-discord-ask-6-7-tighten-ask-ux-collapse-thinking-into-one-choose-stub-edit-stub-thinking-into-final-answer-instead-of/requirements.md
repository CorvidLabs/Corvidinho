# Requirements

## REQ delta (discord)

### REQ-discord-047 (DISCORD-ASK-6)

When the bridge posts a button ask (Choose stub + components), it SHALL NOT leave a separate thinking embed whose primary status is "Needs your input" (or stuck equivalent) as the public UX. It SHALL prefer a single public Choose stub by editing the thinking progress message into that stub (clearing the embed) when `editMessage` is available.

Acceptance Criteria
- Button ask path: one tracked public message with Choose components; no parallel "Needs your input" Done embed.
- Fallback when editMessage unavailable: prior behavior (status embed + separate stub reply) remains safe.

### REQ-discord-048 (DISCORD-ASK-7)

On successful completion after a button pick, or on a normal successful mention done, the bridge SHALL prefer editing the existing stub or thinking progress message into the final answer content instead of posting an extra "✅ Done" thinking status plus a new reply, when `editMessage` is available.

Acceptance Criteria
- Mention success: progress message becomes the answer body; no separate Done+reply when collapse succeeds.
- Button pick success: stub (reused as thinking) becomes the answer; no extra Done+reply when collapse succeeds.
- Ephemeral Choose → options flow unchanged (DISCORD-ASK-1..5).
