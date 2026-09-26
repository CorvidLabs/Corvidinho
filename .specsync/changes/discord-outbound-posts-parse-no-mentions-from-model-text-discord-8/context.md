---
change: discord-outbound-posts-parse-no-mentions-from-model-text-discord-8
artifact: context
---

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
  `reply` (`users` = `mentionUserIds` when given, `repliedUser: true`),
  `sendEmbed` / `editEmbed`, and slash `reply` / `editReply`
  (`{ parse: [] }`). Content is defanged before the 1900-char cap.
- `discord-post-message`: REST body adds `allowed_mentions: { parse: [] }`
  and defanged content.
- `LiveGatewayOptions.discord`: optional discord.js module override so tests
  drive the real live gateway with a fake client (default dynamic import).

Kept: replies still ping the author they answer (same UX as today); the ask
post keeps `users: [owner]` (REQ-discord-044), and no owner means nobody.
Role / user syntax stays visible text; it just cannot ping.

Ruled out: stripping `<@&id>` / `<@id>` from text (allowed_mentions is the
authoritative control and the text can stay readable); a per-call opt-in
(the client default plus explicit payloads leave no path that forgets it).
No new slash command, env var, config, table or column.
