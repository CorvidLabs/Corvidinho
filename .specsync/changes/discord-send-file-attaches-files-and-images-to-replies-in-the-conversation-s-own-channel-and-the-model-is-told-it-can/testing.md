---
change: discord-send-file-attaches-files-and-images-to-replies-in-the-conversation-s-own-channel-and-the-model-is-told-it-can
artifact: testing
---

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
