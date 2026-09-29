# Lesson bundle — discord-send-file-attaches-files-and-images-to-replies-in-the-conversation-s-own-channel-and-the-model-is-told-it-can

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord-send-file attaches files and images to replies in the conversation's own channel, and the model is told it can (DISCORD-17)
- **Kind**: Feature
- **Specs**: discord, agent
- **Paths**: plugins/discord/send-file.ts, plugins/discord/index.ts, src/discord/agent-client.ts, src/discord/bridge.ts, src/discord/command-handlers/session.ts, src/discord/command-handlers/work.ts, src/discord/requester-perms.ts, src/store/scrub.ts, src/agent/execute.ts, tests/discord.send-file.test.ts, specs/discord/discord.spec.md, specs/discord/testing.md, specs/agent/agent.spec.md, specs/agent/testing.md, docs/discord.md, docs/DISCORD-GO-LIVE.md
- **Acceptance**: discord-send-file (dangerous, mutating, minTier 1) attaches a project file or image, or the worktree diff as changes.diff, to a message in the conversation's own channel that the bridge set for the run (the thread in a thread); a --channel is refused and a run with no conversation channel or acting user is refused; the channel allowlist gates first (a thread through its parent) and the acting user must view, send and attach files there (DISCORD-8); non-owner runs are refused by ROLES-CHAT-3 and an unlisted tool by SAFE-1; at most 8 MB, PNG/JPEG/GIF/WebP by magic bytes or UTF-8 txt/log/md/diff/patch/json/csv; text and the caption are secret-scrubbed (SAFE-6) and the caption parses no mentions; SAFE-2 protected, .specsync and secret paths are refused by name and by symlink target, and paths outside the project are refused; a Discord 413/40005 is reported; dry run posts nothing; each attach is audited; the system prompt says the model can attach and never to say it can't whenever the tool is offered in a conversation run

## Evidence

- Verification commit: `edf84b060c2aab069298b9896df9707aed3e9811`
- Base commit: `8dd5714b4e441275c939ca40d362bb513caaea0b`
- Verified by: `specsync check --spec agent --spec discord`

## From the change's context.md

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

## From the change's design.md

# Design

- `plugins/discord/send-file.ts` owns `discord-send-file`; `index.ts`
  registers it in `loadDiscordPlugins` and re-exports its constants.
- Channel: `CORVIDINHO_DISCORD_REPLY_CHANNEL_ID` (and
  `_PARENT_CHANNEL_ID` for a thread) written by the Discord spawn client from
  `AgentRunChatOpts.replyChannelId` / `replyParentChannelId`, always
  overwritten (empty when unset). Bridge chat / thread / reply-continue /
  button runs pass `msg.threadId ?? msg.channelId` (parent `msg.channelId`
  in a thread); `/session start` and `/work` pass `interaction.channelId`;
  the scheduler passes nothing, and WATCH has no acting user, so both are
  refused (and ROLES-CHAT-3 refuses them first anyway).
- Order of gates in the handler: argv (`--channel` refused) → channel env →
  acting user → allowlist (`checkChannel(parent || channel)`) → build the
  attachment (path clamp, SAFE-2 on lexical and resolved path, type, size,
  sniff / UTF-8, scrub) → token → DISCORD-8 check with `attachFiles` (fail
  closed on throw) → dry run → upload.
- `verifyRequesterCanSend` gains `attachFiles` (live path also checks
  `AttachFiles`; the test checker receives `{ attachFiles: true }` only
  when asked, so existing call expectations are unchanged).
- `redactSecretEnvValues` is extracted from `formatErrorLine` so uploads and
  error lines share one env-secret redaction.
- `--git-diff` uses the git plugin's runner with the secret exclude
  pathspecs, refuses when a secret path slips through or the diff is empty or
  over 8 MB, and scrubs the text.
- `execute.ts`: `DISCORD_ATTACH_AGENT_SYSTEM_INSTRUCTIONS` joins the system
  prompt only when the tool is offered and the run has a reply channel, so a
  run that cannot attach never promises it.
- Trade-offs: 8 MB is a fixed ceiling (a 413 reports a lower server limit
  instead of probing the guild); one file per call; no model-supplied text
  blobs (diffs come from git, files from disk).

## From the change's testing.md

# Testing

Regression tests: `tests/discord.send-file.test.ts` (21 tests). Fixtures
only: a stubbed `fetch` records each multipart upload (`payload_json`,
`files[0]` name / type / bytes), `setRequesterPermCheckerForTests` records
each DISCORD-8 check with its needs, a fake CLI prints the spawn env, a fake
gateway drives `startBridge`, and a fake LLM provider records the system
prompt. Temp projects and a temp git repo; no live Discord or network.

- Before the change (same test file on the base, `8dd5714`): 20 fail, 1 pass
  (the "no attach promise" guard, which holds trivially without the tool).
- After the change: 21 pass, 0 fail; `bunx tsc --noEmit` clean; full
  `bun test` and `fledge lanes run verify --non-interactive` green.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-476` | `tests/discord.send-file.test.ts` › "discord-send-file plugin" | Registered dangerous + mutating, minTier 1, description says it can attach and never to say it can't; SAFE-1 deny unlisted; ROLES-CHAT-3 refuses a non-owner before any check; PNG to the run's channel as `image/png`, bytes unchanged, `parse: []`, check `{ attachFiles: true }` for the acting user; log scrubbed (vendor key + bot token value); caption defanged and scrubbed; `--channel` / `-c` / `--channel=` refused; no channel / no acting user refused; allowlist first, thread through parent; SAFE-2 / `.specsync` / secret / symlink / outside paths refused; type, magic-byte and UTF-8 checks; > 8 MB refused before the check; 413 / 40005 reported; cannot-attach and throwing checks send nothing; dry run uploads nothing; `started` + `ok` audit rows; `--git-diff` empty refused, `changes.diff` without `.env.local` and scrubbed. |
| `REQ-discord-476` | `tests/discord.send-file.test.ts` › "the bridge supplies the conversation channel" | Spawn env carries `CORVIDINHO_DISCORD_REPLY_CHANNEL_ID` / `_PARENT_CHANNEL_ID` from the opts, empty when unset, never the stale parent env; `startBridge` passes the channel for a channel mention, thread + parent for a thread mention, and the command's channel for `/session start` and `/work`. |
| `REQ-agent-476` | `tests/discord.send-file.test.ts` › "the model is told it can attach" | Allowlisted + reply channel: tool offered and the system prompt carries the attach block and the `--git-diff` hint; not allowlisted or no reply channel: no attach block. |

## Where these lessons go

- `specs/discord/context.md`
- `specs/agent/context.md`
