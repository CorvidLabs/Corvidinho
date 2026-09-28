---
module: discord
change: discord-outbound-posts-parse-no-mentions-from-model-text-discord-8
---

# Delta: discord (outbound posts parse no mentions from model text, DISCORD-8)

## Added

### REQUIREMENT REQ-discord-205

Every Discord post the bridge or its agent makes SHALL parse no mentions
from its content (DISCORD-8 confused deputy; ROLES-CHAT-3 / ROLES-CHAT-8:
text steered by a non-owner's prompt or by public GitHub content SHALL NOT
use the bot's own mention powers). The live gateway's discord.js `Client`
SHALL default `allowedMentions` to `{ parse: [], repliedUser: true }`, and
every outbound payload SHALL set `allowedMentions.parse = []` explicitly:
gateway `reply` (chat mention / reply-continue / thread replies, refusal and
worktree-failure replies, schedule tick and announce posts), `editMessage`
(DISCORD-ASK collapse edits), thinking embed sends and edits, slash `reply` /
`editReply` (including the `/session start` and `/work` deferred public
replies), and ask-button component `reply` / `update`. So `@everyone`,
`@here`, `<@&role>` and `<@user>` in the text SHALL never ping. A reply
SHALL still ping the author it replies to. The only other pings SHALL be
users the caller names in `mentionUserIds`: the requester on a clarify ask
and the owner on a stuck ask or spend-cap stop (REQ-discord-044,
AUTONOMY-2/4, SAFE-8); an empty or missing list pings nobody else. `@everyone` / `@here` SHALL
also be defanged (zero-width space) in all outbound text before the
1900-character cap. The agent's `discord-post-message` REST post SHALL send
`allowed_mentions: { parse: [] }` and the defanged text. No new slash
command, env var, config, table or column.

Acceptance Criteria
- A chat reply (mention and reply-continue) whose summary contains `@everyone`, `@here`, `<@&id>` and `<@id>` is sent with `allowedMentions.parse` empty, no `roles` / `users`, `repliedUser: true`, and no literal `@everyone` / `@here`.
- The `/session start` and `/work` deferred public replies (`editReply`) and ephemeral slash replies carry `allowedMentions.parse` empty and defanged text.
- The live client default, thinking embed sends and edits, `editMessage`, ask-button component replies/updates, and schedule tick posts carry `parse: []`.
- An ask post allows exactly the users it names (`users: mentionUserIds`, e.g. `[owner]`); an empty list allows no user.
- `discord-post-message` sends `allowed_mentions: { parse: [] }` and defanged text.
- Fixture tests inject a fake discord.js into the real live gateway and stub fetch for the plugin; no live Discord or network.
