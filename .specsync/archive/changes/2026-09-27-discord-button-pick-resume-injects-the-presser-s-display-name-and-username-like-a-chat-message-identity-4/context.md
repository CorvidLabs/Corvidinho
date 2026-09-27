---
change: discord-button-pick-resume-injects-the-presser-s-display-name-and-username-like-a-chat-message-identity-4
artifact: context
---

# Context

IDENTITY-4 (hi/identity.md): "Discord chat injects acting user Discord id
plus display name from Discord and the owner map when known; never invent
names like Kyn; memory stays scoped to that acting user".

On `origin/main` (1c7b6ce) the chat path in `src/discord/bridge.ts` passes
`msg.authorDisplayName` and `msg.authorUsername` to
`enrichPromptWithIdentity`, and `/session start` and `/work` pass the slash
`userDisplayName` / `userUsername`. The ask button pick path (the resume
that runs the agent after a DISCORD-ASK choice) passes only `{ userId, owner }`,
and `ComponentInteraction` in `src/discord/gateway.ts` has no name fields at
all: `adaptComponent` copies only `interaction.user.id`. A non-owner's
resumed prompt therefore carries the snowflake with no `display_name`, so
the model has no Discord name for the person it is talking to on that turn,
though it had one on the turn before. The owner is not affected (the owner
map display wins and the owner is passed).

Repro on main: @mention as a non-owner, get a Choose ask, pick an option;
the resumed prompt's `[Corvidinho acting Discord user …]` block has
`discord_user_id` and no `display_name` line.

Scope: this slice only. Open PRs #232 (ask-button actor gate + mute/rate,
which also edits `adaptComponent` and `ComponentInteraction` for role ids)
and #233 (SAFE-3 clamp) are left alone; the new fields and helper sit away
from #232's lines to keep the two PRs mergeable in either order.
