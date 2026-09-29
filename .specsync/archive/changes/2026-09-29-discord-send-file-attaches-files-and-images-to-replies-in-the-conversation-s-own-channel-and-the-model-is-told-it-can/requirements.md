---
change: discord-send-file-attaches-files-and-images-to-replies-in-the-conversation-s-own-channel-and-the-model-is-told-it-can
artifact: requirements
---

# Requirements

Captured HI met (no new criteria invented; DISCORD-17 was captured in the
stacked hi-capture PR, not re-captured here):

- **DISCORD-17** (hi/discord.md): "It can attach files and images
  (screenshots, logs, diffs, charts) to its replies in the conversation's
  channel, and it never says it can't send them." → `discord-send-file`
  (files, images, `--git-diff`) in the conversation's channel; the tool
  description and, when offered in a conversation, the system prompt say it
  can attach and must never say it can't.
- **DISCORD-5**: posts only in allowlisted channels → the channel allowlist
  gates first (a thread through its parent).
- **DISCORD-8**: the acting user must be able to post (and attach) there.
- **SAFE-1 / SAFE-5**: dangerous, allowlisted, audited.
- **ROLES-CHAT-3 / -5**: mutating, refused for non-ADMIN runs.
- **SAFE-2**: protected infra is never attached (plus `.specsync` and secret
  paths), symlinks followed, no escape.
- **SAFE-6**: text, diffs and captions are scrubbed before they leave.

Canonical requirements (see deltas): **REQ-discord-476** (Added: the plugin,
the bridge-supplied channel and its gates) and **REQ-agent-476** (Added: the
system-prompt attach block).
