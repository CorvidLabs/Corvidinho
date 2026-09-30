---
change: community-members-can-t-start-work-declared-community-and-undeclared-users-get-the-quiet-ephemeral-not-authorized-reply
artifact: design
---

# Design

- **Gate (IDENTITY-11.a).** In `src/discord/command-handlers/work.ts`,
  right after the existing role resolution and the SAFE-13 inbound check and
  before `deferReply` / `createWithWorktree`: when the resolved role is not
  owner or team (`workAllowedFor`), reply `NOT_AUTHORIZED` ephemerally and
  return. Nothing is deferred, created, run or verified. No dispatcher
  change, no new module, no config.
- **Role source.** The #285 resolver unchanged: `resolveDiscordActingRole`
  over the live owner config and the people list re-read for this command, so
  a VM edit or `/admin people role` applies to the next `/work`. Muted or
  deny-listed callers are community there too (they are normally stopped
  earlier by the dispatcher's mute / actor gates).
- **Order vs SAFE-13.** The injection check stays first so a community
  `/work` whose description looks like an injection still gets the SAFE-13
  reply and owner ping ("it tells me rather than going quiet"); an ordinary
  community `/work` gets the quiet refusal.
- **PR step.** Unchanged. It still re-resolves the role after the run; its
  community branch now covers only a team member demoted mid-run.
- **Tests.** `tests/roles.community-no-work.test.ts` (new) proves the gate on
  a real temp git repo; `tests/fixtures/team-people.ts` (new) declares a
  non-owner test invoker team so existing `/work` tests keep testing the
  non-owner paths they covered.

## Design choices pending Leif

Each is the most conservative reading of the captured text; none adds a
criterion.

1. The refusal is the owner commands' ephemeral `not authorized` (as
   `/announce channel`, `/schedule create` and `/admin` answer a
   non-owner), not the DISCORD-DENY zero-width ack (that is for callers
   outside the allowlist). No public post, no DM.
2. No SAFE-5 audit row for a refused community `/work` (like `/announce
   channel` and `/schedule create`; only `/admin` and `/schedule
   delete` audit denials).
3. The SAFE-13 check runs before the role gate, so an injected community
   `/work` still pings the owner (SAFE-13) instead of the quiet reply.
4. `/work` stays registered and visible to every guild member; the handler
   refuses. No per-role command visibility.
5. With no owner configured nobody is owner (IDENTITY-3), so only a
   declared team member can start `/work` (the #285 resolver keeps team
   without an owner); with nobody declared team, nobody can (IDENTITY-12
   default-deny). Before, anyone in an allowlisted channel could run a
   read-only one.
6. `/session start` and chat stay open to community (read tools only), as
   IDENTITY-11.a names only `/work`.
