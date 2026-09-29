---
id: discord-send-file-serves-a-thread-allowlisted-by-its-own-id-like-the-bridge-and-re-checks-the-8-mb-cap-on-the-bytes
state: archived
type: bug_fix
base_commit: 5366fff96501327ad3bcc30f55105f2c16884b0b
---

# Discord-send-file serves a thread allowlisted by its own id like the bridge and re-checks the 8 MB cap on the bytes read (DISCORD-17 review follow-up)

## Intent

discord-send-file serves a thread allowlisted by its own id like the bridge and re-checks the 8 MB cap on the bytes read (DISCORD-17 review follow-up)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- discord-send-file attaches in a thread allowlisted by its own id whose parent is not listed, as the router serves it (REQ-discord-212), and still refuses a deny-listed thread under an allowlisted parent and an allowlisted thread under a deny-listed parent (deny wins); a file whose stat was under 8 MB but whose bytes read are over it is refused with nothing checked or uploaded; an ask-button pick in a thread resumes with the thread as reply channel and its parent; DISCORD-GO-LIVE step 4 lists the bot's Attach Files permission

## No-spec Rationale

Not applicable
