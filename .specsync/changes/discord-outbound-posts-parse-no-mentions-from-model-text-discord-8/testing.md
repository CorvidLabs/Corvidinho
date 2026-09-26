---
change: discord-outbound-posts-parse-no-mentions-from-model-text-discord-8
artifact: testing
---

# Testing

Regression tests: `tests/discord.allowed-mentions.test.ts`. A fake discord.js
module (records every `channel.send`, `message.edit` and interaction
`reply` / `editReply` payload) is injected into the real live gateway via
`LiveGatewayOptions.discord`; the bridge runs dry with an injected agent whose
summary is `@everyone @here <@&role> <@user> <@!user>`. The plugin test stubs
`fetch`. No live Discord, network or git worktrees.

- Before the fix (same tests, pre-fix `gateway.ts` / plugin plus only the
  injection hook): 11 fail, 3 pass (helper unit tests and the already-safe
  ask path).
- After the fix: 14 pass, 0 fail in the file; full `bun test` 1068 pass,
  1 skip, 0 fail; `bunx tsc --noEmit` clean.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-205` | `tests/discord.allowed-mentions.test.ts` | Client default `{ parse: [], repliedUser: true }`; `reply` with and without `replyToMessageId` sends `parse: []`, no roles/users, defanged text, cap ≤ 1900 after defang; embeds send/edit `parse: []`; bridge @mention and reply-continue replies plus every thinking embed send/edit carry `parse: []`; `/session start` and `/work` `editReply` and an ephemeral slash `reply` carry `parse: []` and defanged text; a no-ask schedule tick through the gateway `reply` carries `parse: []`; `discord-post-message` REST body has `allowed_mentions: { parse: [] }` and defanged text. |
| `REQ-discord-044` | `tests/discord.allowed-mentions.test.ts`, `tests/discord.ask-ping.test.ts` | Ask reply through the live gateway allows exactly `users: [owner]` with `parse: []`; `mentionUserIds: []` allows nobody; existing ask-ping tests unchanged in behavior (two titles reworded). |
