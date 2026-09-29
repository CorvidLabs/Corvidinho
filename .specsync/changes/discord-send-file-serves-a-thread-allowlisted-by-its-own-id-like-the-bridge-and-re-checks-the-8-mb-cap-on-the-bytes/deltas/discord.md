---
module: discord
change: discord-send-file-serves-a-thread-allowlisted-by-its-own-id-like-the-bridge-and-re-checks-the-8-mb-cap-on-the-bytes
---

# Delta: discord (discord-send-file serves a thread allowlisted by its own id; the 8 MB cap holds for the bytes read)

## Modified

### REQUIREMENT REQ-discord-476

The agent SHALL be able to attach a file or image (screenshots, logs, diffs,
charts) to its reply in the conversation's channel (DISCORD-17) through the
plugin `discord-send-file`, registered by `loadDiscordPlugins` as
dangerous (SAFE-1 allowlist, SAFE-5 audit through `runPlugin`), mutating
(ROLES-CHAT-3: non-owner, WATCH and schedule runs are refused before it runs)
and minTier 1. It SHALL attach only in the channel the bridge set for the run:
the spawn client SHALL always write `CORVIDINHO_DISCORD_REPLY_CHANNEL_ID` and
`CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID` from
`AgentRunChatOpts.replyChannelId` / `replyParentChannelId` (empty when
unset, never inherited); chat, reply-continue, thread and ask-button runs SHALL
pass the conversation's channel (the thread, with its parent, in a thread) and
`/session start` / `/work` the command's channel; schedules SHALL pass none.
A `--channel` / `-c` argument SHALL be refused, and a run with no
conversation channel or no acting user SHALL be refused, nothing sent. The
channel allowlist SHALL gate first (a thread through its parent, DISCORD-5),
then the DISCORD-8 requester check SHALL run for the acting user with View
Channel, Send Messages and Attach Files (`verifyRequesterCanSend` option
`attachFiles`); a check that cannot run SHALL refuse. The file SHALL be at
most 8 MB (Discord's default upload limit) and SHALL be a PNG, JPEG, GIF or
WebP image whose magic bytes match its extension, or UTF-8 text with a
`.txt`, `.log`, `.md`, `.diff`, `.patch`, `.json` or `.csv`
extension; text (and the optional caption) SHALL be secret-scrubbed (SAFE-6:
vendor-key shapes and set secret env values, `redactSecretEnvValues`) before
upload, and the caption SHALL parse no mentions (REQ-discord-205). SAFE-2
protected paths (`.env*`, `.git`, `fledge.toml`, `bunfig.toml`,
`specs`, `*.spec.md`, keystores), any `.specsync` path and secret paths
(`.ssh`, keys, credentials) SHALL be refused, judged on the path as given and
on where it resolves inside the project root with symlinks followed; a path
that leaves the project SHALL be refused. `--git-diff [--staged]` SHALL
attach the worktree (or index) diff as `changes.diff` (`staged.diff`) with
secret paths excluded (a secret path that slips through refuses) and the text
scrubbed, so a large diff goes as a `.diff` attachment. A Discord 413 / code
40005 answer SHALL be reported as over the server's upload limit, not retried.
`CORVIDINHO_DISCORD_DRY_RUN=1` SHALL post nothing. No slash command, config
key, table or column is added; the two env vars are bridge-to-run plumbing.

A conversation thread on `deny_channels` SHALL be refused even when its
parent is allowlisted (deny wins, REQ-discord-212 / REQ-plugins-005), before
the requester check, with the `checkChannel` "is denied" error; nothing is
uploaded.

The conversation's channel SHALL pass the gate the bridge serves it by
(`isMonitoredConversation` on the bridge's channel set, REQ-discord-212 /
REQ-discord-004): a thread allowlisted by its own id SHALL pass even when its
parent is not listed, and a thread SHALL be refused when it or its parent is
on `deny_channels` (deny wins), before the requester check, nothing uploaded.
The 8 MB cap SHALL hold for the bytes actually read as well as for the size
first checked: a file that grew past it after that check SHALL be refused
before the requester check, nothing uploaded.

Acceptance Criteria
- `discord-send-file` is registered dangerous, mutating, minTier 1; its description says it can attach and never to say it can't.
- SAFE-1 denies it when not allowlisted; a non-owner run is refused (ROLES-CHAT-3) before any check or upload.
- A PNG is uploaded to the run's channel as `image/png`, bytes unchanged, `allowed_mentions.parse = []`, after a requester check for the acting user with `attachFiles`.
- A text log is uploaded with vendor keys and the bot token value redacted; the caption is defanged and scrubbed.
- `--channel` / `-c` / `--channel=` and a run with no conversation channel or acting user are refused, nothing uploaded.
- A channel off the allowlist is refused; a thread passes through its allowlisted parent.
- `.env*`, `.git`, keystore, `.specsync`, `specs/`, `.ssh`, `fledge.toml`, symlinks to protected files, symlinks out of the project and outside paths are refused.
- Disallowed types, image bytes that do not match the name and non-UTF-8 text are refused; over 8 MB is refused before any upload; a 413 / 40005 is reported.
- A requester who cannot attach, or a check that throws, sends nothing; dry run uploads nothing; `started` and `ok` audit rows are written.
- `--git-diff` refuses an empty diff and attaches `changes.diff` without secret paths and scrubbed.
- The spawn client writes the reply channel env (empty when none); the bridge passes the conversation's channel on chat, thread, `/session start` and `/work` runs.
- A deny-listed thread under its allowlisted parent is refused with the "is denied" error: no requester check runs and nothing is uploaded; another thread under that parent still passes.
- A thread allowlisted by its own id, its parent not listed, attaches in the thread after the acting user's check; with its parent deny-listed it is refused ("is denied"); an unlisted thread under an unlisted parent is refused; nothing else is checked or uploaded.
- A file whose size check saw it under 8 MB but whose bytes read are over it is refused with the upload-limit error: no requester check runs and nothing is uploaded.
- An ask-button pick in a thread resumes with `replyChannelId` = the thread and `replyParentChannelId` = its parent.
