---
change: discord-send-file-attaches-files-and-images-to-replies-in-the-conversation-s-own-channel-and-the-model-is-told-it-can
artifact: tasks
---

# Tasks

- [x] Regression tests through the real plugin runner, spawn client, bridge and tool loop (on the base without the change: 20 of 21 fail).
- [x] `plugins/discord/send-file.ts`: `discord-send-file` (dangerous, mutating, minTier 1), bridge-set channel only, allowlist, DISCORD-8 with Attach Files, 8 MB, type allowlist + magic bytes, UTF-8 + SAFE-6 scrub, SAFE-2 / `.specsync` / secret paths by name and target, `--git-diff`, 413 / 40005, dry run; registered in `loadDiscordPlugins`.
- [x] `requester-perms.ts`: `attachFiles` need, `REQUESTER_CANNOT_ATTACH` and its fix hint.
- [x] `scrub.ts`: `redactSecretEnvValues` shared with `formatErrorLine`.
- [x] Spawn client env + `AgentRunChatOpts.replyChannelId` / `replyParentChannelId`; bridge chat / thread / button and `/session start` / `/work` pass the conversation's channel.
- [x] `execute.ts`: attach block in the system prompt when the tool is offered in a conversation.
- [x] Specs: discord files / Public API / Invariants / Error Cases / testing; agent Public API / Invariants / testing; deltas REQ-discord-476 and REQ-agent-476 (Added).
- [x] Docs: `docs/discord.md` (Files and images in replies, mentions, limits) and `docs/DISCORD-GO-LIVE.md` (intent note, E.3 row).
- [x] SpecSync approve / check / audit / coverage, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
