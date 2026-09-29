---
change: discord-send-file-attaches-files-and-images-to-replies-in-the-conversation-s-own-channel-and-the-model-is-told-it-can
artifact: plan
---

# Plan

1. Regression tests `tests/discord.send-file.test.ts` (fail on the base).
2. Plugin `plugins/discord/send-file.ts` + registration; `attachFiles` on the
   requester check; `redactSecretEnvValues`.
3. Bridge plumbing: `AgentRunChatOpts.replyChannelId` /
   `replyParentChannelId`, spawn env, chat / button / `/session start` /
   `/work` callers.
4. System-prompt attach block in `execute.ts`.
5. Specs (files, Public API, Invariants, Error Cases, testing), deltas
   REQ-discord-476 / REQ-agent-476, `docs/discord.md`,
   `docs/DISCORD-GO-LIVE.md`.
6. `specsync change approve` → `specsync change check --commit` →
   `specsync check --require-coverage 100` → `hi check` → `bunx tsc` →
   `bun test` → `fledge lanes run verify --non-interactive`.
