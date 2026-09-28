---
change: discord-outbound-posts-parse-no-mentions-from-model-text-discord-8
artifact: testing
---

# Testing

Regression tests: `tests/discord.allowed-mentions.test.ts`. A fake discord.js
module (records every `channel.send`, `message.edit` and interaction
`reply` / `editReply` / `update` payload) is injected into the real live
gateway via `LiveGatewayOptions.discord`; the bridge runs dry with an
injected agent whose summary is `@everyone @here <@&role> <@user> <@!user>`.
Bridge tests are path-agnostic: they wait for the summary to go out (a
collapsed `editMessage`, a fresh send or a slash `editReply`) and then check
every outbound payload. The plugin test stubs `fetch`. No live Discord,
network or git worktrees.

- Before the fix (same tests on `origin/main` v0.0.33 with only the injection
  hook and the helper module added): 14 fail, 2 pass (the helper unit tests).
- After the fix: 16 pass, 0 fail in the file; `bunx tsc --noEmit` clean;
  full `bun test` 2054 pass, 9 skip, 2 fail. The 2 failures
  (`search.secret-path` ADMIN symlink listing, `cli.doctor-truth` unreadable
  lane file) fail the same way on clean `origin/main` in the authoring sandbox
  (runs as root on Bun 1.3.11; CI uses Bun 1.4.2) and are unrelated.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-205` | `tests/discord.allowed-mentions.test.ts` | Client default `{ parse: [], repliedUser: true }`; `reply` with and without `replyToMessageId` sends `parse: []`, no roles/users, defanged text, cap ≤ 1900 after defang; an ask `reply` allows exactly its `mentionUserIds`; `editMessage` (collapse) sends `parse: []` and only named users; embeds send/edit `parse: []`; slash `reply` and deferred `editReply` and ask-button component `reply` / `update` carry `parse: []`; through the bridge, @mention and reply-continue answers, a clarify ask (only the requester may be pinged), `/session start` and `/work` answers and every thinking embed / edit carry `parse: []`; a no-ask schedule tick through the gateway `reply` carries `parse: []`; `discord-post-message` REST body has `allowed_mentions: { parse: [] }` and defanged text. |
| `REQ-discord-044` (unchanged) | `tests/discord.allowed-mentions.test.ts`, `tests/discord.ask-ping.test.ts` | Ask pings keep their named users (requester / owner) under `parse: []`; existing ask-ping tests unchanged in behavior (two titles reworded). |
