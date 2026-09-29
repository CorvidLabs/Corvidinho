---
change: discord-send-file-attaches-files-and-images-to-replies-in-the-conversation-s-own-channel-and-the-model-is-told-it-can
artifact: context
---

# Context

Issue #76 (M2 "Talk anywhere"). Leif confirmed DISCORD-17 in the 2026-09-28
interview and it was captured in `hi/discord.md` by the stacked hi-capture PR
(branch `claude/hi-capture-interview-2026-09-28`): "It can attach files and
images (screenshots, logs, diffs, charts) to its replies in the
conversation's channel, and it never says it can't send them." Interview
design calls: a new dangerous plugin `discord-send-file`, allowlisted like
`discord-post-message`, mutating (ROLES-CHAT keeps it from non-owner runs),
the DISCORD-8 acting-user requester check applies; same channel only (the
bridge supplies it, the model cannot choose one); Discord's upload limit
(default 8 MB, lower if the guild says so) and a MIME / extension allowlist;
text secret-scrubbed (SAFE-6); SAFE-2 protected paths refused with symlinks
followed; large diffs as `.diff` attachments; the model is told it can
attach; dry run posts nothing; audited like other posts.

Before: the agent had no way to attach anything. Its only Discord write was
`discord-post-message` (text to a model-named allowlisted channel), so it
told users it could not send files.

Constraints kept: #232 / #233 scope untouched; v1 off-chain; no new slash
command, config key, table or schema bump; `specs/` only through SpecSync.
The branch merges `origin/main` (#232, #268, #269) so the caption reuses
`defangMassMentions` from REQ-discord-205 and the spec edits do not conflict.
