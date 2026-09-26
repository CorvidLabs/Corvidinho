---
change: discord-outbound-posts-parse-no-mentions-from-model-text-discord-8
artifact: tasks
---

# Tasks

- [x] Regression tests through the real live gateway on a fake discord.js (fail before: 11 of 14).
- [x] `allowed-mentions.ts`: `outboundAllowedMentions`, `defangMassMentions` (re-exported by `ask-ping.ts`).
- [x] Gateway: client default + explicit `allowedMentions` and defang on reply, embeds, slash reply/editReply; `LiveGatewayOptions.discord` test hook.
- [x] `discord-post-message`: `allowed_mentions: { parse: [] }` + defanged text.
- [x] Spec Public API / Invariants / files; delta REQ-discord-205 (Added), REQ-discord-044 (Modified); docs/discord.md.
- [x] `bunx tsc --noEmit`, `bun test`, `bun src/cli.ts --help` (verify-lane steps run individually).
- [ ] `specsync change` register / apply / check / approve / finalize / archive (specsync CLI not reachable from the authoring sandbox).
- [ ] `fledge lanes run verify --non-interactive` (fledge CLI not reachable from the authoring sandbox).
