---
change: discord-outbound-posts-parse-no-mentions-from-model-text-discord-8
artifact: requirements
---

# Requirements

Captured HI met (no new criteria invented; no `hi/` edits):

- **DISCORD-8** (hi/discord.md): "If the agent tries to post to another
  channel on my behalf, the bridge checks that *I* could have posted there,
  not only that the bot could." Same confused-deputy rule applied to pings:
  model text steered by someone else no longer uses the bot's own mention
  powers (`@everyone`, `@here`, roles, users).
- **ROLES-CHAT-3** (hi/roles.md): non-ADMIN callers cannot drive mutating /
  externally visible actions (`discord-post` is listed). A mass ping is such
  an action; a non-owner's prompt can no longer cause one through the reply.
- **ROLES-CHAT-8** (hi/roles.md): community sessions read any public GitHub.
  That content is untrusted and can no longer turn into a ping.
- **AUTONOMY-2** / **IDENTITY-3**: the owner ping on an ask is unchanged
  (owner only; no owner means nobody).

Canonical requirements changed (see delta): **REQ-discord-044** (Modified:
the "no mention restriction" criterion for ordinary replies), and
**REQ-discord-205** (Added: outbound mention safety).
