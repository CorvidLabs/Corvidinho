---
change: discord-outbound-posts-parse-no-mentions-from-model-text-so-untrusted-input-cannot-ping-roles-everyone-or-here-discord
artifact: design
---

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
