---
change: discord-send-file-serves-a-thread-allowlisted-by-its-own-id-like-the-bridge-and-re-checks-the-8-mb-cap-on-the-bytes
artifact: context
---

# Context

Review follow-up to PR #270 (issue #76, DISCORD-17 `discord-send-file`),
which was squash-merged before its adversarial review ran. The review's
major finding (the plugin gated the conversation channel on the allowlist
file / `CORVIDINHO_DISCORD_ALLOW_*` only, not `DISCORD_CHANNEL_IDS`) already
landed on `main` in #272 (c831898, `mergeChannelIds`), and #276 made a
deny-listed thread refused under an allowlisted parent. This change carries
only the review's remaining minors, re-derived against current `main`:

- A thread allowlisted by its own id, its parent not listed, is served by the
  chat router (`isMonitoredConversation`, REQ-discord-212), so the model is
  offered `discord-send-file` there, but the plugin checked only the parent
  and refused every attach ("not allowlisted").
- The 8 MB cap was checked on `statSync(...).size` only; a file that grew
  between the stat and the read was uploaded whole (an image has no later
  size check; text is re-checked after scrubbing).
- The ask-button path's reply channel (thread + parent) was wired but had
  no test.
- The go-live bot invite did not list **Attach Files**, which uploads need.

Constraints: no new env var, flag, config key, table or command; deny still
wins (#276); no HI capture (DISCORD-17 is already in `hi/discord.md`).
Out of scope, pending Leif: refusing secret-named files (`secrets.json`,
`client_secret*`, `token.json`), EXIF stripping, replying to the human's
message, `--git-diff` covering untracked / committed changes, blanking
`CORVIDINHO_DISCORD_REPLY_*` in WATCH spawns (REQ-watch-008 is being changed
by #67).
