---
change: community-members-can-t-start-work-declared-community-and-undeclared-users-get-the-quiet-ephemeral-not-authorized-reply
artifact: testing
---

# Testing

Fixture tests only: a temp git repo as the project with a temp worktree
base, recording agents, a stub PR step, `handleSlashInteraction` /
`handleWorkCommand` with fake interactions, and `startBridge` with a null
gateway. No live Discord, no network, no token.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-065` | `tests/roles.community-no-work.test.ts` (community refused) | Declared community (`role = "community"`), declared with no role, and undeclared: `handleSlashInteraction` returns handled; the only reply is `{ content: "not authorized", ephemeral: true }`; `deferReply` is never called; no agent run, no PR-step call, no session, no work task; the temp repo still has one worktree, no `talk/*` branch and an empty worktree base. Same with a `project` option, and with no owner and no people file. |
| `REQ-discord-065` | `tests/roles.community-no-work.test.ts` (blocked team) | A team member who is muted, or on `deny_users`, calling `handleWorkCommand` directly: the same refusal and nothing created (community at the handler). |
| `REQ-discord-065` | `tests/roles.community-no-work.test.ts` (owner / team unchanged) | The owner and a team member: deferred reply, one run with `actingRole` owner / team, `workTask: true`, `cwd` under the worktree base, one PR-step call, a completed task, a second worktree in the repo. Passes on the base too (guard). |
| `REQ-discord-065` | `tests/roles.community-no-work.test.ts` (live re-read) | After a team `/work`, the people file is edited (Tofu → community, Kyn → team): Tofu's next `/work` gets the refusal and adds no worktree; Kyn's runs with `actingRole: "team"` and the work flag. No restart. |
| `REQ-discord-065` | `tests/roles.community-no-work.test.ts` (bridge) | `startBridge` with the people file as `CORVIDINHO_ALLOWLIST_FILE` and the git repo as the project: a declared community and an undeclared `/work` get the ephemeral refusal and spawn nothing, no session, no worktree; the owner's `/work` runs as owner with the work flag. |
| `REQ-discord-065` / `REQ-discord-088` | `tests/roles.team.test.ts`, `tests/work.pr.test.ts`, `tests/discord.actor-gate.test.ts` | Community and undeclared `/work`: no run, no PR step, the reply is `not authorized` (was: ran, reply said only owner or team ship a PR). A listed-but-community user passes the actor gate and gets the refusal; a listed team member runs. A team member demoted mid-run still gets no PR (unchanged). |
| `REQ-discord-065` | `tests/safe.injection.test.ts` | A stranger's injected `/work` still gets the SAFE-13 reply, the owner ping and the audit row (the check runs before the role gate); the ordinary non-owner fenced `/work` now runs as a declared team member. |
| `REQ-discord-088` | `tests/worktree.project-scope.test.ts` | A team member's `/work` on an out-of-scope project is still refused by the project scope ("outside the bridge project root"); on an allowlisted sibling it runs in its own worktree. |

Fail-on-base proof: with main's `src/discord/command-handlers/work.ts`
(20a0f58) swapped in, `tests/roles.community-no-work.test.ts` ran 8 fail /
1 pass (the owner / team guard), and the updated community cases in
`tests/roles.team.test.ts`, `tests/work.pr.test.ts` and
`tests/discord.actor-gate.test.ts` failed (11 fail / 59 pass across the
five files run); restored, all pass. The other edited tests pass on both
(they only declare the invoker team or run as owner).

Full suite: `bun test` green; `bunx tsc --noEmit` clean;
`specsync check --require-coverage 100` 100%; `hi check` green;
`fledge lanes run verify --non-interactive` completed.
