---
module: discord
change: discord-send-file-serves-a-thread-allowlisted-by-its-own-id-like-the-bridge-and-re-checks-the-8-mb-cap-on-the-bytes
---

# Delta: discord (discord-send-file serves a thread allowlisted by its own id; what it reads is what it checked, capped at 8 MB)

## Added

### REQUIREMENT REQ-discord-506

`discord-send-file` (REQ-discord-476) SHALL gate the conversation's channel
the way the bridge serves it: `isMonitoredConversation` on the bridge's
channel set (allowlist file and `CORVIDINHO_DISCORD_ALLOW_CHANNELS` union
`DISCORD_CHANNEL_IDS`, REQ-discord-212 / REQ-discord-004). A thread
allowlisted by its own id SHALL pass even when its parent is not listed, and
a thread SHALL be refused when it or its parent is on `deny_channels` (deny
wins, REQ-plugins-005), before the requester check, nothing uploaded. The
file SHALL be read once, from one descriptor opened without following a link
at the checked path, and the file that descriptor holds SHALL be a regular
file whose own path is inside the project and is not a SAFE-2 protected,
`.specsync` or secret path: a file or folder swapped for a link after the
path checks SHALL be refused (SAFE-2). The 8 MB cap SHALL hold for the bytes
read as well as for the size first taken, and no more than the cap + 1 byte
SHALL be read: a file that grew past the cap after its size was taken SHALL
be refused before the requester check, nothing uploaded. An ask-button run
in a thread SHALL carry the thread as the reply channel and its parent. No
env var, flag, config key, table or command is added.

Acceptance Criteria
- A thread allowlisted by its own id, its parent not listed, attaches in the thread after the acting user's check; with its parent deny-listed it is refused ("is denied"); a deny-listed thread under an allowlisted parent is refused ("is denied"); an unlisted thread under an unlisted parent is refused (not allowlisted); nothing else is checked or uploaded.
- A file whose size, as first taken, is under 8 MB but which is over it when read is refused with the upload-limit error after at most 8 MB + 1 byte is read: no requester check runs and nothing is uploaded.
- A checked file swapped for a link to `.env`, or whose folder is swapped for a link into `.ssh`, after the path checks is refused (SAFE-2): no requester check runs and nothing is uploaded.
- An ask-button pick in a thread resumes with `replyChannelId` = the thread and `replyParentChannelId` = its parent.
