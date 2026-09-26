---
module: discord
change: align-session-start-and-work-with-discord-ask-7-collapse-thinking-into-one-final-message-instead-of-done-embed-plus
---

# Delta: discord (slash ASK-7 alignment)

## Modified

### REQUIREMENT REQ-discord-048

On successful completion after a button pick, on a normal successful mention
done, or on successful `/session start` / `/work` completion, the bridge SHALL
prefer editing the existing stub or thinking progress message into the final
answer content instead of posting an extra "✅ Done" thinking status plus a new
reply, when `editMessage` is available (DISCORD-ASK-7). For slash, when collapse
succeeds the deferred interaction reply SHALL be deleted (or thin-resolved).
Ephemeral Choose → options remains unchanged (DISCORD-ASK-1..5).

Acceptance Criteria
- Mention success: progress message becomes the answer body when collapse succeeds.
- Button pick success: stub (reused as thinking) becomes the answer when collapse succeeds.
- Slash `/session start` / `/work` success: thinking becomes the answer body and the deferred reply is deleted (or thin) when collapse succeeds.
- Fallback preserves Done embed + separate reply when editMessage is unavailable.
