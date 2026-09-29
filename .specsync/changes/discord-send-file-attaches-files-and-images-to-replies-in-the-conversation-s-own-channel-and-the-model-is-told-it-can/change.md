---
id: discord-send-file-attaches-files-and-images-to-replies-in-the-conversation-s-own-channel-and-the-model-is-told-it-can
state: implementing
type: feature
base_commit: 8dd5714b4e441275c939ca40d362bb513caaea0b
---

# Discord-send-file attaches files and images to replies in the conversation's own channel, and the model is told it can (DISCORD-17)

## Intent

discord-send-file attaches files and images to replies in the conversation's own channel, and the model is told it can (DISCORD-17)

## Affected Canonical Specs

- `discord`
- `agent`

## Acceptance Criteria

- discord-send-file (dangerous, mutating, minTier 1) attaches a project file or image, or the worktree diff as changes.diff, to a message in the conversation's own channel that the bridge set for the run (the thread in a thread); a --channel is refused and a run with no conversation channel or acting user is refused; the channel allowlist gates first (a thread through its parent) and the acting user must view, send and attach files there (DISCORD-8); non-owner runs are refused by ROLES-CHAT-3 and an unlisted tool by SAFE-1; at most 8 MB, PNG/JPEG/GIF/WebP by magic bytes or UTF-8 txt/log/md/diff/patch/json/csv; text and the caption are secret-scrubbed (SAFE-6) and the caption parses no mentions; SAFE-2 protected, .specsync and secret paths are refused by name and by symlink target, and paths outside the project are refused; a Discord 413/40005 is reported; dry run posts nothing; each attach is audited; the system prompt says the model can attach and never to say it can't whenever the tool is offered in a conversation run

## No-spec Rationale

Not applicable
