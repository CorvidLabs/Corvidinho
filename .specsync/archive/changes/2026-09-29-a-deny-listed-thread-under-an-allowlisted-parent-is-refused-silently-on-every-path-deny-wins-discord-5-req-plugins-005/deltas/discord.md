---
module: discord
change: a-deny-listed-thread-under-an-allowlisted-parent-is-refused-silently-on-every-path-deny-wins-discord-5-req-plugins-005
---

# Delta: discord (deny wins over an allowlisted parent on every path, DISCORD-5)

## Modified

### REQUIREMENT REQ-discord-212

The bridge SHALL process a MessageCreate only when the message's own channel
is allowlisted (DISCORD-5): the thread's parent channel (the DISCORD-2.a
resolution) or the thread itself. This gate SHALL run before the thread,
reply-to-bot and mention paths, and the channel recorded on a session SHALL
NOT stand in for it, so a message that references a tracked bot message
from an allowlisted channel never continues that session, spawns the agent,
or posts or edits anything in a channel that is not allowlisted. Refusal
SHALL be silent (DISCORD-DENY-1): no public reply, no DM, no reaction.

The gateway SHALL set `InboundMessage.referencedMessageId` only for a reply
in the message's own channel: a reference of type
`MessageReferenceType.Forward` SHALL be dropped, and so SHALL a reference
whose channel is neither the message's channel nor, inside a thread, the
thread's parent channel. A reply in the same allowlisted channel SHALL still
continue its session (DISCORD-2), and a thread under an allowlisted parent
SHALL still continue its session (DISCORD-2.a).

An ask button press (DISCORD-ASK) SHALL resume a session only when the press
channel is allowlisted, or is the session's thread under an allowlisted
parent (DISCORD-2.a), and the session's own channel, where the resumed run
posts, is still allowlisted. Otherwise the bridge SHALL answer with an
ephemeral ack only — the allowlist tip for an admin, the zero-width ack for
anyone else (DISCORD-DENY-2/3) — and SHALL NOT resume the session, run the
agent, or send or edit anything. No slash command, env var, table or column
is added.

Deny SHALL always win over an allowlisted parent (REQ-plugins-005): when a
thread or its parent channel is on `deny_channels`, the thread SHALL count as
not allowlisted on every path, even when the other id is allowlisted. An
@mention, a thread continuation and a reply to a tracked bot message there
SHALL be refused silently as above; an ask button pressed there, or for a
session whose channel or thread is deny-listed, SHALL get only the ephemeral
ack and SHALL NOT resume; a slash command there and a schedule whose channel
is that thread SHALL be refused (both gate the thread id itself); restart
recovery (REQ-discord-311) SHALL post and edit nothing there; and
`discord-send-file` (REQ-discord-476) SHALL upload nothing there.
`isMonitoredConversation` (`permissions.ts`: the thread or its parent is
allowlisted and neither is deny-listed) SHALL be the shared check for
MessageCreate, ask buttons and restart recovery.

Acceptance Criteria
- The owner forwards a tracked bot message from an allowlisted channel into a non-allowlisted channel (with or without an @mention): `routeMessage` returns a silent `ignore` / `refuse` with no reply, the agent is not spawned, and nothing is sent, edited or deleted in that channel.
- A thread message under a non-allowlisted parent does not continue a session whose recorded channel is allowlisted.
- `replyReferenceMessageId` returns undefined for a forward-type reference and for a reference to another channel; it returns the message id for a same-channel reply (default or missing type) and, inside a thread, for a reference to the thread or its parent.
- A reply to a tracked bot message in the same allowlisted channel still continues the same session; a thread under an allowlisted parent still continues its session.
- An ask button pressed in a non-allowlisted channel, or after the session's channel left the allowlist, gets only the ephemeral zero-width ack (the allowlist tip for an admin): the ask stays pending, the agent is not run, and nothing is sent or edited; a press in the allowlisted channel, or in the session's thread under an allowlisted parent, still resumes (DISCORD-ASK-3).
- With `channels = [parent]` and `deny_channels = [thread]`, an @mention in the thread is refused silently (no reply): no session is started, the agent is not run and nothing is posted; a session started there before the deny is not continued by a thread message, a reply to its bot message or a mention.
- A thread under a deny-listed parent is refused even when the thread itself is allowlisted.
- `componentChannelAllowlisted` is false for a press in the deny-listed thread and for a session in it (also when pressed in the parent); the bridge answers only the zero-width ack (the allowlist tip for an admin), the ask stays pending and nothing is sent.
- A slash command in the deny-listed thread gets only the zero-width ack (the tip for the owner); `/schedule create` naming the thread as its channel is refused, and a schedule whose channel is the thread neither runs nor posts at tick.
- The allowlisted parent itself and its other threads are still served (DISCORD-2.a).

### REQUIREMENT REQ-discord-311

While the bridge works on a reply to a Discord message, or on the run a
button pick (DISCORD-ASK) resumes, it SHALL keep one
`discord_inflight_replies` row (schema v9: id, session id, channel id, the
allowlisted parent channel id when the reply is in a thread, progress embed id
once sent, request message id, start time; no message text) from before the
progress embed is sent until the reply finishes, and SHALL delete it on every
exit path (done, failed exit, ask, worktree refused, thrown error). On start,
the bridge SHALL read the rows left by an earlier process before any new reply
begins and, once the gateway is up, handle each one sequentially and best
effort: when neither the row's channel nor its parent channel is allowlisted
any more (DISCORD-5), post and edit nothing; otherwise edit the bot's own
progress embed to the red failed status `interrupted: Corvidinho restarted
before this reply finished — please send it again`, and when there is no embed
id or the edit fails, reply to the recorded request message in the same
channel with the same text; then delete the row. Recovery SHALL NOT throw out
of bridge start and SHALL NOT touch any other channel or message. No slash
command or env var is added.

A row whose channel (the thread) or parent channel is on `deny_channels`
SHALL count as not allowlisted even when the other is allowlisted (deny wins,
REQ-discord-212): nothing is edited or posted and the row is deleted.

Acceptance Criteria
- A running reply has exactly one row whose progress id is the sent embed; the row is gone after success, failed exit, ask, thrown error and worktree refusal; ignored or refused messages never add one.
- A reply in a thread records the thread as its channel and the allowlisted parent channel; a button pick's resumed run records a row (request id = the ask stub message) and clears it after.
- A bridge that died mid-reply leaves the row; the next start edits that embed (same channel, same message id) to the error color with the interrupted text, sends no new message, and deletes the row.
- A failed edit, or a row with no embed id, falls back to a reply to the request message with the interrupted text; the row is deleted.
- A row whose channel and parent channel are no longer allowlisted gets no edit and no reply; the row is deleted.
- Edit and reply both failing still lets the bridge start; the row is deleted.
- With no rows, bridge start sends, edits and replies nothing.
- A fresh DB is schema 9 with the table; a v8 DB migrates to 9 and keeps its rows.
- A row in a deny-listed thread under an allowlisted parent, or in an allowlisted thread under a deny-listed parent, gets no edit and no reply; the row is deleted. A row in another thread under the allowlisted parent is still recovered in that thread.

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
