---
change: discord-outbound-posts-parse-no-mentions-from-model-text-so-untrusted-input-cannot-ping-roles-everyone-or-here-discord
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
- **AUTONOMY-2** / **AUTONOMY-4** / **SAFE-8**: ask pings are unchanged (the
  requester on a clarify ask, the owner on a stuck ask or spend-cap stop);
  they are the only pings besides the replied-to author.

Canonical requirements changed (see delta): **REQ-discord-205** (Added:
outbound mention safety). REQ-discord-044 is not modified: its ask mention
rules already hold, and it no longer has an ordinary-reply criterion.
