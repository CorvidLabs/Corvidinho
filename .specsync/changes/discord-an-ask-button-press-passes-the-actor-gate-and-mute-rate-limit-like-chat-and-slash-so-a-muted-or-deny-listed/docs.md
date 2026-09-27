---
change: discord-an-ask-button-press-passes-the-actor-gate-and-mute-rate-limit-like-chat-and-slash-so-a-muted-or-deny-listed
artifact: docs
---

# Docs

- `specs/discord/discord.spec.md`: new test in `files:`, Public API names
  `gateActor` as the ask button actor gate too and adds
  `interactionRoleIds` / `RawMemberRoles` / `ComponentInteraction.roleIds`,
  and one invariant line for the press gate order and ephemeral refusals.
- `docs/discord.md`: the gate-order line now names the actor gate
  (`gateActor`, missing before) and the press gate order; the ask section
  says a press gets the same actor and mute/rate gates, with ephemeral
  refusals and the ask kept. After merging main, the "Rate limits and mutes
  (DISCORD-6)" subsection from #221 says the shared window also covers ask
  button presses (open and pick each count), the level applies on every
  path, and ask button refusals stay ephemeral like slash. It also says every
  press counts (including one on someone else's or an expired ask), so a full
  @mention → open → pick round uses 3 slots. The spec Public API names
  `adaptComponent` as what sets `ComponentInteraction.roleIds`.
- No CHANGELOG / STATUS / package version edits (release PRs own those).
