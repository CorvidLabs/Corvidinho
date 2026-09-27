---
id: align-session-start-and-work-with-discord-ask-7-collapse-thinking-into-one-final-message-instead-of-done-embed-plus
state: archived
type: feature
base_commit: 76d10237cd3ac73bb6cfaee512b281fdf6bfc26c
---

# Align /session start and /work with DISCORD-ASK-7: collapse thinking into one final message instead of Done embed plus interaction reply

## Intent

Align /session start and /work with DISCORD-ASK-7: collapse thinking into one final message instead of Done embed plus interaction reply

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- /session start and /work with thinkingOutbound+editMessage: one public channel message carries the final body (thinking collapsed via finalizeContent); deferred slash reply is deleted (or thin-resolved); no separate ✅ Done embed + full interaction reply. Fallback when editMessage unavailable: prior Done/fail embed + editReply body. Tests cover collapse + fallback.

## No-spec Rationale

Not applicable
