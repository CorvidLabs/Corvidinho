# Lesson bundle — community-members-can-t-start-work-declared-community-and-undeclared-users-get-the-quiet-ephemeral-not-authorized-reply

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Community members can't start /work: declared community and undeclared users get the quiet ephemeral not-authorized reply and no worktree, branch, work task or run, while the owner and team keep /work (IDENTITY-11.a, #65)
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: allowlist.example.toml, docs/DISCORD-GO-LIVE.md, docs/discord.md, src/discord/command-handlers/work.ts, tests/discord.actor-gate.test.ts, tests/discord.allowed-mentions.test.ts, tests/discord.ask-answer-modal.test.ts, tests/discord.collapsed-ping.test.ts, tests/discord.session-thread.test.ts, tests/discord.session-worktree.test.ts, tests/discord.slash-ask7.test.ts, tests/discord.slash-choose-ask.test.ts, tests/discord.slash-pending-ask.test.ts, tests/discord.slash-reply-continuity.test.ts, tests/discord.slash.test.ts, tests/discord.spend.test.ts, tests/identity.recognise.test.ts, tests/roles.team.test.ts, tests/safe.injection.test.ts, tests/work.pr.test.ts, tests/worktree.project-scope.test.ts, tests/fixtures/team-people.ts, tests/roles.community-no-work.test.ts, hi/identity.md, INTENT.md, specs/discord/discord.spec.md, specs/discord/requirements.md, specs/discord/testing.md
- **Acceptance**: A /work from a community member — declared community, a declared person with no role, or anyone undeclared (IDENTITY-12), including a muted or deny-listed team member and everyone when no owner is configured — gets only the ephemeral 'not authorized' reply the owner-only commands give (/announce channel, /schedule create, /admin), with no deferred public reply, no session, no git worktree or talk/* branch, no work task, no agent run (so no verify lane) and no PR step; the role comes from resolveDiscordActingRole over the owner config and the people list re-read when the command runs, so a promotion or demotion in the file applies to the next /work without a restart; the owner's and a declared team member's /work run unchanged (worktree, work flag, PR step); a community /work description that looks like an injection attempt still gets the SAFE-13 refusal and owner ping; tests/roles.community-no-work.test.ts fails on the base sources and passes on the branch

## Evidence

- Verification commit: `88eca58a74f91228b3b9ca71817ec84b94c0a9f4`
- Base commit: `39767a8f72e42f1d30b9fac717708f6eb3f41b26`
- Verified by: `specsync check --spec agent --spec discord --spec plugins`

## From the change's context.md

# Context

Issue #65 (M1 "Knows everyone"), roles. Leif's decision in round 12 of the
2026-09-28 interview record (2026-09-29): community gets Q&A and
announcements only; `/work` from community gets the normal quiet not-allowed
reply; team and owner keep `/work`. Captured in this change's PR with `hi`
(first commit) into `hi/identity.md`:

- **IDENTITY-11.a** "Community members can't start /work." (under the
  already captured **IDENTITY-11** "Community members get Q&A and
  announcements only, with no mutating tools.")

Related captured criteria that still hold: IDENTITY-3 (empty owner means
nobody is admin), IDENTITY-10 (team gets work tasks), IDENTITY-12 (role
checked in the tool layer; undeclared is community at most), ROLES-CHAT-2/3,
DISCORD-DENY-1..3 / DISCORD-5 (quiet refusals, never a public "not
authorized"), SAFE-13 (a suspected injection is refused and the owner told).

Gap on the base (main 20a0f58): the #285 roles change (REQ-discord-065,
design choice 6) let community run a read-only `/work`: a community caller
got a deferred public reply, a session, a git worktree and `talk/*` branch,
a work task and an agent run with the verify lane, only without edit tools
and without the PR step (REQ-discord-088 "community /work runs keep the
changes on the work branch"). `docs/discord.md` and
`docs/DISCORD-GO-LIVE.md` said so.

Constraints: reuse the #285 resolver (`resolveDiscordActingRole` over the
owner config and `loadDeclaredPeople`, re-read per command) and the existing
`NOT_AUTHORIZED` ephemeral refusal; no new env var, config key, slash
command, option or schema. #232 / #233 are landed separately and are out of
scope. Specs change only through this SpecSync change. v1 is off-chain.

## From the change's design.md

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

## From the change's testing.md

# Testing

Fixture tests only: a temp git repo as the project with a temp worktree
base, recording agents, a stub PR step, `handleSlashInteraction` /
`handleWorkCommand` with fake interactions, and `startBridge` with a null
gateway. No live Discord, no network, no token.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-065` | `tests/roles.community-no-work.test.ts` (community refused) | Declared community (`role = "community"`), declared with no role, and undeclared: `handleSlashInteraction` returns handled; the only reply is `{ content: "not authorized", ephemeral: true }`; `deferReply` is never called; no agent run, no PR-step call, no session, no work task; the temp repo still has one worktree, no `talk/*` branch and an empty worktree base. Same with a `project` option, and with no owner and no people file. |
| `REQ-discord-065` | `tests/roles.community-no-work.test.ts` (no owner, people file) | No owner configured: declared community, no role and undeclared get the refusal and nothing is created; a declared team member still runs with `actingRole: "team"`, `actingIsAdmin: false` and the work flag. |
| `REQ-discord-065` | `tests/roles.community-no-work.test.ts` (blocked team) | A team member who is muted, or on `deny_users`, calling `handleWorkCommand` directly: the same refusal and nothing created (community at the handler). Through `handleSlashInteraction` the dispatcher stops them first (the ephemeral mute reply / the zero-width ack) and nothing is created either (passes on the base too, guard). |
| `REQ-discord-065` | `tests/roles.community-no-work.test.ts` (owner / team unchanged) | The owner and a team member: deferred reply, one run with `actingRole` owner / team, `workTask: true`, `cwd` under the worktree base, one PR-step call, a completed task, a second worktree in the repo. Passes on the base too (guard). |
| `REQ-discord-065` | `tests/roles.community-no-work.test.ts` (live re-read) | After a team `/work`, the people file is edited (Tofu → community, Kyn → team): Tofu's next `/work` gets the refusal and adds no worktree; Kyn's runs with `actingRole: "team"` and the work flag. No restart. |
| `REQ-discord-065` | `tests/roles.community-no-work.test.ts` (bridge) | `startBridge` with the people file as `CORVIDINHO_ALLOWLIST_FILE` and the git repo as the project: a declared community and an undeclared `/work` get the ephemeral refusal and spawn nothing, no session, no worktree; the owner's `/work` runs as owner with the work flag. |
| `REQ-discord-065` / `REQ-discord-088` | `tests/roles.team.test.ts`, `tests/work.pr.test.ts`, `tests/discord.actor-gate.test.ts` | Community and undeclared `/work`: no run, no PR step, the reply is `not authorized` (was: ran, reply said only owner or team ship a PR). A listed-but-community user passes the actor gate and gets the refusal; a listed team member runs. A team member demoted mid-run still gets no PR (unchanged). |
| `REQ-discord-065` | `tests/safe.injection.test.ts` | A stranger's injected `/work` still gets the SAFE-13 reply, the owner ping and the audit row (the check runs before the role gate); the ordinary non-owner fenced `/work` now runs as a declared team member. |
| `REQ-discord-088` | `tests/worktree.project-scope.test.ts` | A team member's `/work` on an out-of-scope project is still refused by the project scope ("outside the bridge project root"); on an allowlisted sibling it runs in its own worktree. |

Fail-on-base proof: with main's `src/discord/command-handlers/work.ts`
(20a0f58) swapped in, `tests/roles.community-no-work.test.ts` ran 9 fail /
2 pass (the owner / team guard and the dispatcher mute / deny guard), and the
updated community cases in `tests/roles.team.test.ts`,
`tests/work.pr.test.ts` and `tests/discord.actor-gate.test.ts` failed (12
fail / 148 pass across the five files run); restored, all pass. The other edited tests pass on both
(they only declare the invoker team or run as owner).

Full suite: `bun test` green; `bunx tsc --noEmit` clean;
`specsync check --require-coverage 100` 100%; `hi check` green;
`fledge lanes run verify --non-interactive` completed.

## Where these lessons go

- `specs/discord/context.md`
