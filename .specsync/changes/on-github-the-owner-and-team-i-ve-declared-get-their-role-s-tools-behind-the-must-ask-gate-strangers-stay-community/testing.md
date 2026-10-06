---
change: on-github-the-owner-and-team-i-ve-declared-get-their-role-s-tools-behind-the-must-ask-gate-strangers-stay-community
artifact: testing
---

# Testing

`tests/watch.github-roles.test.ts` (12 tests): a temp allowlist file (owner
with `[owner] github_id`, a team and a community person with `github_ids`),
a temp data dir, a real `startWatchPoller` with a capturing agent, the real
WATCH spawn client over a fake bin that dumps its env, the env it hands its
child applied to this process for the tool-layer cases, and a registered
mutating `prod` must-ask command answered through the must-ask test hooks.
No token, no network. `watchTriggerRole` is read through the router module
namespace so the base sources fail on behaviour, not on import.

Fail-on-base proof: with e1a24ed's (`origin/main`) `src/plugins/roles.ts`,
`src/watch/agent-client.ts`, `src/watch/router.ts`, `src/watch/poller.ts`
and `plugins/files/protectedPaths.ts` swapped in, `bun test
tests/watch.github-roles.test.ts` gave 3 pass, 9 fail: both poller cases
(`actingRole` undefined), `watchTriggerRole` (missing), the spawn stamp
(`CORVIDINHO_ACTING_IS_ADMIN=0` for the owner), all three tool-layer cases
(owner and team resolve community), the owner's must-ask card (refused for
the role, no card) and the secret-path case (the owner's WATCH run is
community). The 3 that pass are regression guards: a Discord run ignores the
GitHub keys; team and community never reach a card; no shell and community
workers on WATCH. Restored: 12 of 12 pass.

Two existing tests asserted what this change deliberately ends, and are
updated: `tests/identity.recognise.test.ts` expected the owner's WATCH role
line "a GitHub run still gets no ADMIN tools" (now "this run has the
owner's tools, behind the same must-ask gate as on Discord"), and
`tests/agent.safe3a-owner-shell.test.ts` expected a synthetic env holding the
owner's Discord stamp plus a `watch` surface to keep the owner's catalog; a
watch stamp never takes a Discord id now, so that run is community
(`ownerCatalog` false), and a new case gives the owner's real GitHub stamp
(`CORVIDINHO_WATCH_SESSION_ID`, `CORVIDINHO_ACTING_GITHUB_ID` = `[owner]
github_id`): the owner's other allowlisted tools (`files-delete`) are offered,
the shell and `fledge-run` are not ("WATCH runs never get them").

`tests/agent.allowlisted-dangerous.test.ts` gains "the owner's own WATCH run
(GitHub stamp) never discovers or spawns fledge; its other allowlisted owner
tools stay offered, the shell does not": with e1a24ed's
`src/agent/execute.ts` swapped in (the new roles kept) it fails — fledge-hello
is discovered and offered; with every base source it fails — the run is
community, so `github-pr-review` is not offered. Restored: it passes.

Related suites still pass on the branch: `tests/watch.*`, `tests/roles.*`,
`tests/must-ask.*`, `tests/memory.*`, `tests/search.secret-path.test.ts`,
`tests/files.secret-path.test.ts`, `tests/agent.safe3a-gate.test.ts`,
`tests/discord.safe3a-surface.test.ts`, `tests/github.*`,
`tests/autonomous.*`, `tests/scheduler.owner-role.test.ts` (679 of 679).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-watch-1201` | `tests/watch.github-roles.test.ts` "the poller stamps the role of whoever triggered the run" (3 tests) | owner comment → `owner` with the owner role line; team → `team`; declared community, stranger, re-registered login, no id → `community`; issue-body mention is its author's; an assignment and a review request on the owner's thread → `community` with the community-tools line; fenced thread text; `watchTriggerRole` units. Fail on base: all three. |
| `REQ-watch-008` | `tests/watch.github-roles.test.ts` "the WATCH spawn stamps that role exactly like a Discord run"; `tests/memory.spawn-env.test.ts`, `tests/memory.recall-github.test.ts` (unchanged) | owner → `IS_ADMIN=1` / `owner`, team → `0` / `team`, omitted / community → `0` / `community`, always `WORK_TASK=0`, surface `watch`, empty Discord actor over a parent env holding `1` / `owner` / a Discord id; the existing no-role spawn still gives `admin=[0]`. Fail on base: the stamp case. |
| `REQ-plugins-1201` | `tests/watch.github-roles.test.ts` "the tool layer re-resolves the GitHub trigger's role on every call" (4 tests), "owner runs on GitHub go through the same must-ask gate" (2 tests), "WATCH-specific limits stay for every role" (2 tests) | owner / team by GitHub id; spoofed stamps, login-only, Discord id in WATCH, no WATCH session → community; a Discord run ignores the GitHub keys; live demotion, GitHub deny by login and id, Discord deny and mute, no `[owner] github_id`, unreadable file → community; never a /work task; the owner's must-ask card (`from watch:watch_w1`) approve / deny; team / community / re-registered login refused before any card; secret paths hidden on WATCH for the owner; no shell; worker community. Fail on base: the owner / team resolution, the card and the secret-path cases. |
| `REQ-plugins-065` | `tests/watch.github-roles.test.ts` "team on GitHub: reviews and search, never /work file edits; the owner: everything"; `tests/roles.team.test.ts` (unchanged) | team on WATCH gets the review tools, not `files-edit`, with a stale work stamp; the owner gets both; every Discord-role case unchanged. |
| `REQ-plugins-1201` | `tests/agent.safe3a-owner-shell.test.ts` "WATCH, a schedule, a delegate worker and a local CLI run: refused" (updated) | the owner's GitHub-stamped WATCH run is offered `files-delete` but never `shell-exec` / `fledge-run` (one `WATCH runs never get them` operator line); a watch stamp with only a Discord id is community. |
| `REQ-watch-1201` | `tests/identity.recognise.test.ts` "the owner is recognised by [owner] github_id, never the login …" (updated) | the owner's role line now says the run has the owner's tools behind the must-ask gate. |
| `REQ-agent-1201` | `tests/agent.allowlisted-dangerous.test.ts` "the owner's own WATCH run (GitHub stamp) never discovers or spawns fledge; …" | the owner's GitHub-stamped WATCH run is offered `github-pr-review` and `files-delete`, not `shell-exec`, only the Fledge core reads; `fledge-hello` never registered, fledge never spawned, the call refused as not offered. Fail with e1a24ed's `execute.ts` (fledge-hello discovered) and with every base source (community). |
| all | full `bun test`, `fledge lanes run verify --non-interactive` | Run on this branch before push. |
