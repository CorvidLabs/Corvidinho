---
change: discord-an-ask-button-press-passes-the-actor-gate-and-mute-rate-limit-like-chat-and-slash-so-a-muted-or-deny-listed
artifact: design
---

# Design

- `onComponent` (`src/discord/bridge.ts`): right after the existing
  channel gate (`componentChannelAllowlisted`, REQ-discord-212) and before
  the "not for you" / expiry / open / pick branches:
  1. `gateActor({ userId, roleIds: interaction.roleIds, allowlist, owner })`;
     on deny reply `{ content: EPHEMERAL_SILENT_ACK, ephemeral: true }` and
     return.
  2. `gateRateOrMute({ userId, mutedUsers, rateLimit: { state:
     rateLimitState, config: rateLimitConfig, permLevel } })`, where
     `permLevel` is `resolvePermissionLevel` for the presser (user id,
     role ids, allowlist, owner); on refusal reply `{ content:
     rateGate.reply, ephemeral: true }` (`MUTED` / `RATE_LIMITED`) and
     return.
  Both refusals return before `store.setPendingAsk`, `ThinkingStatus`,
  in-flight tracking or `agent.runChat`, so the ask stays pending and
  nothing is sent or edited. The gates apply to "open" too, so a muted or
  deny-listed user is not shown the choices. The same mute set and rate
  state as chat and slash are used, so presses share one per-user budget.
- `gateway.ts`: new pure `interactionRoleIds(member)` (with the
  `RawMemberRoles` type) reads role ids from a roles cache or raw API ids;
  the slash adapter now calls it instead of its inline copy, and
  `adaptComponent` sets the new optional `ComponentInteraction.roleIds`.
- Order matches slash: an actor deny wins over mute (a deny-listed and muted
  presser gets the zero-width ack, not `MUTED`).
- Trade-off: "open" and "pick" each take one rate-limit slot, as every slash
  command does, so answering a button ask uses two slots of the shared
  per-user budget (default 10 per 60 s). A refused press takes none.
