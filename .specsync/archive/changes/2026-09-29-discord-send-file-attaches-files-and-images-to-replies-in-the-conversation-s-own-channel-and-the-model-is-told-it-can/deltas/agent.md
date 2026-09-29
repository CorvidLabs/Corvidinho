---
module: agent
change: discord-send-file-attaches-files-and-images-to-replies-in-the-conversation-s-own-channel-and-the-model-is-told-it-can
---

# Delta: agent (the model is told it can attach files, DISCORD-17)

## Added

### REQUIREMENT REQ-agent-476

The tool-loop system prompt SHALL carry
`DISCORD_ATTACH_AGENT_SYSTEM_INSTRUCTIONS` (DISCORD-17) exactly when the
run's offered catalog includes `discord-send-file` and the run env names a
conversation channel (`CORVIDINHO_DISCORD_REPLY_CHANNEL_ID`, set by the
bridge): the model can attach files and images (screenshots, logs, diffs,
charts) to its reply in the conversation, SHALL never say it cannot send or
attach them, and SHALL send a large diff as a `.diff` attachment
(`discord-send-file --git-diff`). A run that does not offer the tool, or has
no conversation channel, SHALL NOT carry the block. No env var, flag or
protocol field is added by the agent.

Acceptance Criteria
- With `discord-send-file` allowlisted and a conversation channel, the tool is offered and the system prompt carries the attach block ("never say you cannot send or attach files or images", the `--git-diff` hint).
- Not allowlisted, or no conversation channel: the system prompt has no attach block.
