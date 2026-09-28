# Lesson bundle — discord-outbound-posts-parse-no-mentions-from-model-text-so-untrusted-input-cannot-ping-roles-everyone-or-here-discord

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord outbound posts parse no mentions from model text so untrusted input cannot ping roles, @everyone or @here (DISCORD-8)
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: docs/discord.md, specs/discord/discord.spec.md, specs/discord/testing.md, src/discord/allowed-mentions.ts, src/discord/ask-ping.ts, src/discord/gateway.ts, plugins/discord/index.ts, tests/discord.allowed-mentions.test.ts, tests/discord.ask-ping.test.ts
- **Acceptance**: A chat reply (mention and reply-continue) whose summary contains @everyone, @here, <@&id> and <@id> is sent with allowedMentions.parse empty, no roles/users, repliedUser true, and no literal @everyone/@here; /session start and /work deferred public replies and ephemeral slash replies carry parse empty and defanged text; live client default, thinking embeds, editMessage, ask-button replies/updates, and schedule tick posts carry parse []; an ask post allows exactly the users it names; discord-post-message sends allowed_mentions parse [] and defanged text; fixture tests inject fake discord.js into the live gateway and stub fetch for the plugin with no live Discord or network.

## Evidence

- Verification commit: `31967a88b064710ec58dcbc6a92b28e5ab8a15cc`
- Base commit: `24bba834d5780191bd40ee751eb5409eb2b84ba2`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Found in passing during a read-only review of PR #181 (docs-only; not part of
that PR).

`src/discord/gateway.ts` `handlers.reply` set `allowedMentions` only when
the caller passed `mentionUserIds`, and `bridge.ts` passes it only for
AUTONOMY ask posts. The discord.js `Client` had no default
`allowedMentions`. So every ordinary chat reply (mention, reply-continue,
thread), every schedule tick post without an ask, and the `/session start` /
`/work` deferred public replies (`interaction.editReply`) went out with
Discord's default mention parsing. Those posts carry the model-written
summary. Untrusted text (a non-owner's prompt under ROLES-CHAT-1, or public
GitHub content read under ROLES-CHAT-8) can steer the summary to contain
`@everyone`, `@here`, `<@&roleId>` or `<@userId>`, and the bot then pings
with its own permissions: a confused deputy. The agent's
`discord-post-message` REST post had the same gap. Only `ask-ping.ts`
defanged `@everyone` / `@here` and limited mentions.

Fix:

- New `src/discord/allowed-mentions.ts`: `outboundAllowedMentions({ users,
  repliedUser })` always returns `parse: []` (fresh object per call, users
  deduped); `defangMassMentions` moves here (`ask-ping.ts` re-exports it).
- Live gateway: the `Client` defaults `allowedMentions` to
  `{ parse: [], repliedUser: true }`, and every payload sets it explicitly:
  `reply` and `editMessage` (`users` = `mentionUserIds` when given,
  `repliedUser: true`), `sendEmbed` / `editEmbed`, slash `reply` /
  `editReply` and ask-button component `reply` / `update` (`{ parse: [] }`).
  Content is defanged before the 1900-char cap.
- `discord-post-message`: REST body adds `allowed_mentions: { parse: [] }`
  and defanged content.
- `LiveGatewayOptions.discord`: optional discord.js module override so tests
  drive the real live gateway with a fake client (default dynamic import).

Kept: replies still ping the author they answer (same UX as today); an ask
keeps the users it names in `mentionUserIds` (requester on clarify, owner on
stuck or spend-cap, REQ-discord-044), and an empty list pings nobody else.
Role / user syntax stays visible text; it just cannot ping.

Ruled out: stripping `<@&id>` / `<@id>` from text (allowed_mentions is the
authoritative control and the text can stay readable); a per-call opt-in
(the client default plus explicit payloads leave no path that forgets it).
No new slash command, env var, config, table or column.

## From the change's design.md

# Design

- `src/discord/allowed-mentions.ts` owns outbound mention policy:
  `outboundAllowedMentions({ users?, repliedUser? })` always returns a fresh
  `{ parse: [], users?, repliedUser? }` with users deduped;
  `defangMassMentions` inserts a zero-width space into `@everyone` / `@here`.
  `ask-ping.ts` re-exports `defangMassMentions` so existing call sites stay.
- Live gateway (`gateway.ts`):
  - `Client` is constructed with `allowedMentions:
    outboundAllowedMentions({ repliedUser: true })` so any payload that
    forgets the field still parses nothing.
  - Every outbound path sets `allowedMentions` explicitly and defangs
    content before the 1900-char cap: `reply`, `editMessage`, embeds,
    slash `reply`/`editReply`, component `reply`/`update`.
  - When `mentionUserIds` is given (asks), `users` is set to that list and
    `parse` stays `[]`; empty/missing list pings nobody besides
    `repliedUser` when the call is a reply.
  - `LiveGatewayOptions.discord` lets tests inject a fake discord.js module
    into the real live gateway (default: dynamic import).
- Plugin `discord-post-message`: REST body always sends
  `allowed_mentions: { parse: [] }` and defanged content.
- Trade-off: role/user mention syntax remains visible in text (readable) but
  cannot ping; stripping the syntax was ruled out because
  `allowed_mentions` is the authoritative control.
- No new slash command, env var, config, table or column.

## From the change's testing.md

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
  full `bun test` green on the verify lane.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-205` | `tests/discord.allowed-mentions.test.ts` | Client default `{ parse: [], repliedUser: true }`; `reply` with and without `replyToMessageId` sends `parse: []`, no roles/users, defanged text, cap ≤ 1900 after defang; an ask `reply` allows exactly its `mentionUserIds`; `editMessage` (collapse) sends `parse: []` and only named users; embeds send/edit `parse: []`; slash `reply` and deferred `editReply` and ask-button component `reply` / `update` carry `parse: []`; through the bridge, @mention and reply-continue answers, a clarify ask (only the requester may be pinged), `/session start` and `/work` answers and every thinking embed / edit carry `parse: []`; a no-ask schedule tick through the gateway `reply` carries `parse: []`; `discord-post-message` REST body has `allowed_mentions: { parse: [] }` and defanged text. |
| `REQ-discord-044` (unchanged) | `tests/discord.allowed-mentions.test.ts`, `tests/discord.ask-ping.test.ts` | Ask pings keep their named users (requester / owner) under `parse: []`; existing ask-ping tests unchanged in behavior (two titles reworded). |

## Where these lessons go

- `specs/discord/context.md`
