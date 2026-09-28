# Lesson bundle — discord-an-ask-button-press-passes-the-actor-gate-and-mute-rate-limit-like-chat-and-slash-so-a-muted-or-deny-listed

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord: an ask button press passes the actor gate and mute/rate limit like chat and slash, so a muted or deny-listed user cannot keep a session going by buttons (REQ-discord-201, REQ-discord-010, DISCORD-6, ALLOW-5)
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/discord/bridge.ts, src/discord/gateway.ts, tests/discord.ask-button-gates.test.ts, docs/discord.md
- **Acceptance**: An ask button press (open or pick) in an allowlisted channel runs, after the channel gate, the same actor gate and mute/rate limit as chat and slash: a deny-listed user or role, or an actor not on a non-empty user/role allowlist (owner excepted), gets only the ephemeral zero-width ack; a muted user gets ephemeral MUTED; a user over the rate limit (shared with chat and slash, keyed on the presser's resolved permission level) gets ephemeral RATE_LIMITED. On every refusal the agent does not run, nothing is sent or edited, and the pending ask stays as it was, so the owner can still answer it once allowed; the gateway passes the presser's role ids so role allow/deny applies, and an allowed press still resumes (DISCORD-ASK-3).

## Evidence

- Verification commit: `0ba3447bc5415cd02d6f545a5139d3aa21ff8c32`
- Base commit: `cf8c6768df9330074f41c2ceba29d70208e9518e`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Defect (found while reviewing PR #221, pre-existing on main `cf8c676`): the
Discord bridge's ask button handler (`onComponent` in
`src/discord/bridge.ts`, the DISCORD-ASK "pick" path) ran `agent.runChat`
for the session owner after only the channel gate (REQ-discord-212). It never
called `gateActor` (REQ-discord-201) or `gateRateOrMute` (DISCORD-6 /
REQ-discord-010). Chat (`routeMessage`) and slash
(`handleSlashInteraction`) both run channel → actor → mute/rate first.

Repro on main (bridge, dry run, fake gateway, injected agent that always asks
with buttons): user A @mentions and gets a Choose stub. The owner mutes A (or
A is added to `denyUsers`). A presses a choice and the agent runs a turn
anyway (prompts 1 → 2). That turn asks again with buttons, so A can keep a
session going by buttons alone while muted or deny-listed. The "open" button
also showed the choices to a muted or deny-listed user.

Constraints: existing HI only (DISCORD-6, ALLOW-5, DISCORD-DENY-3,
ROLES-CHAT-1, IDENTITY-1/2); no new command, env var, table or column. A press
needs an interaction ack, so every refusal is ephemeral. The pending ask must
not be cleared on a refusal, so the owner can still answer it once allowed.
PR #221 (DISCORD-6 rate limit by level, merged to main while this change was
open) also modified REQ-discord-010. After merging main, this change's delta
carries REQ-discord-010 as main has it (#221's paragraph and bullets
included) and only adds the ask button paragraph and bullets.

## From the change's design.md

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
- Trade-off: every press takes one rate-limit slot, as every slash command
  does: "open" and "pick" alike, and also a press on someone else's ask or an
  expired ask, since the gates run before those checks (same order as
  slash). A full @mention → open → pick round uses 3 slots of the shared
  per-user budget (default 10 per 60 s); with `DISCORD_RATE_LIMIT_MAX` of 2
  or less a user cannot finish one inside a window. A refused press takes
  none.
- `adaptComponent` is exported so a test covers the live press carrying the
  member's role ids (independent review finding: without that line, role
  allow/deny would silently not apply to presses and no test would fail).

## From the change's testing.md

# Testing

Regression test: `tests/discord.ask-button-gates.test.ts` (13 tests). The
bridge runs end to end (dry run, fake gateway, injected agent that asks with
buttons on every turn, memory thinking outbound, channel allowlist
`chan-on`, owner configured, missing allowlist file).

- Before the fix (origin/main `cf8c676`, bridge and gateway unchanged,
  test file as committed minus the `interactionRoleIds` unit): 7 of 9 fail.
  A muted owner's pick runs the agent (prompts 1 → 2) and a second press runs
  it again; a muted owner's open shows the choices; a deny-listed user, a
  deny-listed role, a deny-listed and muted user, and an unlisted user (with
  a non-empty user list) all resume the session; a pick over
  `DISCORD_RATE_LIMIT_MAX=1` resumes. The two that pass on main are guards:
  the owner not on the user list resumes, and the owner's pick with
  `DISCORD_RATE_LIMIT_BY_LEVEL={"3":100}` resumes.
- Independent review follow-up: 3 more tests. A rate-limited open gets
  `RATE_LIMITED` (no choices); an @mention plus a `/status` fill
  `DISCORD_RATE_LIMIT_MAX=2` so the pick is refused (presses share the
  budget with slash); `adaptComponent` sets `roleIds` from a cached member,
  a raw API member, or none. Dropping the `roleIds` line in `adaptComponent`
  fails that test; removing `permLevel` from the press rate check fails the
  owner by-level test; removing `roleIds` from the press `gateActor` call
  fails both role tests. A deny-listed role is now also refused on open.
- After the fix: 13 pass, 0 fail. Existing `forward-channel` (press channel
  gate), `ask-buttons`, `ask-ephemeral`, `actor-gate`, `rate-mute`,
  `collapsed-ping`, `inflight-replies`, `session-worktree` and `spend`
  tests pass unchanged.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-010` | `tests/discord.ask-button-gates.test.ts` | A muted session owner's pick gets exactly `[{ content: MUTED, ephemeral: true }]`, the agent does not run again, nothing is sent/edited/deleted, and the ask id stays pending; a second pick is refused the same way; after `unmuteUser` the same button resumes with the picked label. A muted owner's open gets `MUTED`, not the choices. With `DISCORD_RATE_LIMIT_MAX=1` a member's pick after their @mention gets `RATE_LIMITED` and the ask stays pending, while the owner's @mention is still served; with `DISCORD_RATE_LIMIT_BY_LEVEL={"3":100}` the owner's pick after their @mention resumes (level resolved for the press). A rate-limited open gets `RATE_LIMITED`, not the choices; with max 2, an @mention and a `/status` leave no slot and the pick gets `RATE_LIMITED` (shared with slash). |
| `REQ-discord-201` | `tests/discord.ask-button-gates.test.ts` | A session owner added to `denyUsers` gets only the zero-width ack on pick and on open; a presser with a role on `denyRoles` (role ids on the press) gets the zero-width ack; a deny-listed and muted presser gets the zero-width ack, not `MUTED`; with `users = ["someone-else"]` and `roles = ["role-a"]` the session owner's pick without roles gets the zero-width ack and with `roleIds: ["role-a"]` resumes; the owner not on the user list resumes. In every refusal the agent does not run, nothing is sent/edited/deleted, and the ask stays pending. `interactionRoleIds` reads a roles cache, raw API role ids, or nothing, and `adaptComponent` puts them on the press as `roleIds`. A deny-listed role is refused on open too. |

## Where these lessons go

- `specs/discord/context.md`
