---
change: a-schedule-the-owner-creates-runs-with-the-owner-s-tools-and-allowlist-never-the-shell-runners-or-fledge-commands-and
artifact: testing
---

# Testing

Regression tests (fixtures only: memory / temp SQLite stores, a temp
allowlist file, a recording agent, a fake spawn bin that resolves the role in
the child, an injected fake provider, the real approvals store answered by
`tests/fixtures/must-ask.ts`, `startDaemon` and `startBridge` with a null
gateway; no network, no tokens).

- `tests/scheduler.owner-role.test.ts` (17 tests, new).
- `tests/roles.team.test.ts` (3 tests added: "DISCORD-SCHEDULE-1.a:
  schedule-run stamps in the tool layer").
- `tests/agent.allowlisted-dangerous.test.ts` (1 test added: the owner's own
  scheduled run and Fledge discovery).

Fail-on-base proof: in this branch's worktree, the base's (af4597e)
`src/scheduler/service.ts`, `src/plugins/roles.ts`, `src/agent/execute.ts`,
`src/discord/bridge.ts`, `src/daemon/daemon.ts` and
`src/discord/agent-client.ts` swapped in (the branch's additive
`src/agent/ask.ts` kept, so the new file loads): 15 failures — 11 of 17 in
`scheduler.owner-role` (all but the read-only, owner-chat, other-person and
three `mustAskRefusedAsk` unit guards), all 3 new `roles.team` tests and the
new `agent.allowlisted-dangerous` test; with the base's `src/agent/ask.ts`
too the new file cannot load. With the branch's sources restored all 66 tests
in the three files pass. On the branch: `bunx tsc --noEmit` clean, full
`bun test` green, `fledge lanes run verify --non-interactive` green.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-741` | `tests/scheduler.owner-role.test.ts` › "the owner's own schedule runs with the owner stamp and the schedule surface; its own result post needs no card" | `actingIsAdmin: true`, no `actingRole`, surface `schedule`, session `schedule_<id>`, prompt unfenced; one `✅` post to the channel. |
| `REQ-discord-741` | `tests/scheduler.owner-role.test.ts` › "schedules other people create stay read-only: a declared team member's and a stranger's run community, never team" | Both spawned `actingIsAdmin: false`, `actingRole` undefined, surface `schedule`. |
| `REQ-discord-741` | `tests/scheduler.owner-role.test.ts` › "the owner is read live: …" | Start-time owner A, `loadOwner` names B: A's schedule `false` and fenced `role: community`, B's `true`; two reads for two runs. |
| `REQ-discord-713` | same test | The creator's role for the SAFE-12 fence uses the live owner. |
| `REQ-discord-741` | `tests/scheduler.owner-role.test.ts` › "no owner configured now, an owner read that fails, or a muted owner: community (fail closed)" | null, a throw (logged `[scheduler] owner failed: …`) and a muted owner all spawn `false`. |
| `REQ-discord-741` | `tests/scheduler.owner-role.test.ts` › "without loadOwner the owner given at start is used (existing callers keep working)" | `true` with only `owner`. |
| `REQ-discord-741` | `tests/scheduler.owner-role.test.ts` › "an owner schedule on a non-git project keeps its own scoped folder, never the project folder itself" | cwd `scoped-talk-schedule_…`, not the project dir; `actingIsAdmin: true`. |
| `REQ-discord-741` | `tests/scheduler.owner-role.test.ts` › "the owner's schedule resolves owner (the shell gate still refuses a scheduled run); a team member's resolves community" | The real spawn client's child reports role `owner`, stamps `1` / `owner` / `schedule`, session `schedule_<id>`, shell "scheduled runs never get them"; the team member's child `community` / `0` / `community`. |
| `REQ-plugins-065` | same test | The child's `resolveActingRole` gives `owner` for the owner's schedule and `community` for a team member's. |
| `REQ-agent-741` | `tests/scheduler.owner-role.test.ts` › "denied: the card was raised for the exact post, nothing was posted, and the run ends blocked with a stuck ask naming it" | One `mustask-post` card with the exact text and the owner as requester; post refused; next call unrun; one model request; `blocked`, no verify; the stuck question text; the operator line. |
| `REQ-agent-741` | `tests/scheduler.owner-role.test.ts` › "no answer in time (lapsed): a no too — the run ends blocked with a stuck ask saying nobody answered" | `blocked`, stuck, "nobody answered Approve card … in time (SAFE-20: no answer means no)". |
| `REQ-agent-741` | `tests/scheduler.owner-role.test.ts` › "outside a schedule (the owner's own chat) a denied card leaves the run going: the model sees the refusal, no ask" | Post refused, no ask, `done`, two model requests. |
| `REQ-discord-741` | `tests/scheduler.owner-role.test.ts` › "another person's schedule never reaches the card: the post is not offered and refused for the role" | Not offered, no card, the role refusal, no ask. |
| `REQ-discord-741` | `tests/scheduler.owner-role.test.ts` › "the scheduler records that ask: the schedule waits, and the next due tick runs nothing and raises no new card" | First tick: one run, one card, open stuck ask naming the tool, one post pinging the owner with controls; next two due ticks skipped, no run, still one card, one wait note. |
| `REQ-agent-741` | `tests/scheduler.owner-role.test.ts` › "denied, lapsed and a resent deny give a stuck ask naming the tool, the why, the rule and the card", "anything else is not: …", "a long why is cut; secrets in it are scrubbed" | Exact question for `denied`; the lapse and resent wording; null for a call that ran, `worker` / `no-owner` / `unavailable` / `aborted` and plain failures; a long why cut, a token scrubbed. |
| `REQ-cli-741` | `tests/scheduler.owner-role.test.ts` › "daemon: the owner's schedule runs as the owner; after the file names another owner, the next run is community" | `[true]`, then `[true, false]` after rewriting `[owner]`, no restart. |
| `REQ-discord-741` | `tests/scheduler.owner-role.test.ts` › "bridge: the owner's schedule runs as the owner; after the file names another owner, the next run is community" | Same through `startBridge`'s scheduler. |
| `REQ-plugins-065` | `tests/roles.team.test.ts` › "the owner's own schedule (owner stamp) is owner; a schedule is never team, whatever its stamp" | Owner stamp ⇒ `owner`; a team member with community, team or owner stamp ⇒ `community` in a `schedule_*` session; team stamp in `sess_*` ⇒ `team`. |
| `REQ-plugins-065` | `tests/roles.team.test.ts` › "runPlugin: the owner's schedule passes the role gate for mutating tools; a team member's schedule gets the role refusal even for a team review tool" | Owner: `github-issue-comment` (dry run) and `files-write` run; team: role refusal, exit 2. |
| `REQ-plugins-065` | `tests/roles.team.test.ts` › "the catalog: the owner's schedule is offered its allowlisted owner tools (never the shell); a team member's schedule no mutating tool" | Owner catalog has `github-issue-comment`, `github-pr-create`, `files-write`, not `shell-exec`; team catalog no mutating tool. |
| `REQ-agent-741` | `tests/agent.allowlisted-dangerous.test.ts` › "the owner's own scheduled run (owner stamp, schedule session and surface) never discovers or spawns fledge; …" | `github-pr-review` and `files-delete` offered; `shell-exec` not; only the Fledge core reads; `fledge-hello` never registered; no `calls.log`; the call refused as not offered. |
