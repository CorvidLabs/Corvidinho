---
change: discord-send-file-attaches-files-and-images-to-replies-in-the-conversation-s-own-channel-and-the-model-is-told-it-can
artifact: design
---

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
