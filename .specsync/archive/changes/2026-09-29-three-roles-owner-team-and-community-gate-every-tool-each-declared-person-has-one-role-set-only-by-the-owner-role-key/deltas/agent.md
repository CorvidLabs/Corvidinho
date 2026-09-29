---
module: agent
change: three-roles-owner-team-and-community-gate-every-tool-each-declared-person-has-one-role-set-only-by-the-owner-role-key
---

# Delta — agent (the tool catalog by role; community site / roadmap prompt)

## Added

### REQUIREMENT REQ-agent-065

`buildOpenAiTools` SHALL take the acting role (`actingRole`: owner / team /
community / null) and `workTask`, and when `actingRole` is given keep exactly
the plugins `roleAllowsPlugin(actingRole, entry, workTask)` allows
(REQ-plugins-065) after the SAFE-1 allowlist, tier and SAFE-9 filters; without
it the `actingIsAdmin` filter is unchanged (ROLES-CHAT-2). `createTaskExecute`
SHALL resolve the role with `resolveActingRole(env)` on every attempt and pass
it with `workTask` (`CORVIDINHO_ACTING_WORK_TASK`), so each run's catalog is
built from the role at that moment (IDENTITY-12): owner and no role session get
today's ADMIN catalog (IDENTITY-9); team gets the read tools plus
`github-issue-comment` / `github-pr-review` when allowlisted, plus
`files-write` / `files-edit` in a `/work` run (IDENTITY-10); community gets
today's non-ADMIN catalog (IDENTITY-11). Fledge plugin discovery stays owner /
no-role-session only. A not-offered mutating plugin the model names gets the
role refusal exactly when the role, re-resolved at that call, does not allow
it (REQ-agent-333 unchanged otherwise). `PUBLIC_QA_AGENT_SYSTEM_INSTRUCTIONS`
SHALL name the only community site / roadmap sources — the public repo docs
(README, docs/, STATUS, CHANGELOG — `github-docs-read` or the project files)
and the public issues and milestones of allowed public repos
(`github-issue-list`, `github-milestone-list`) — and say nothing else counts
as the site or roadmap (ROLES-CHAT-8.a).

Acceptance Criteria
- With every dangerous plugin allowlisted, `actingRole` owner and null equal the ADMIN catalog and community equals the non-ADMIN catalog (no mutating plugin); team adds only `github-issue-comment` / `github-pr-review` (and exactly `files-write` / `files-edit` with `workTask`); an unallowlisted review tool is not offered.
- Through `createTaskExecute` and a scripted provider: a team chat run offers the review tools but not `files-write` or `github-pr-create`; a team `/work` run adds the file tools; a team member on a community-stamped surface and an undeclared actor with a team stamp get read tools only.
- The public Q&A prompt names README, docs/, STATUS, CHANGELOG and the public issues and milestones of allowed public repos, says nothing else counts, and no longer offers "the project site, and the roadmap".
- Regression tests in `tests/roles.team.test.ts` and `tests/github.public-docs.test.ts` fail on the base sources and pass after.

## Modified

### REQUIREMENT REQ-agent-501

Allowlisted dangerous tools in the task-run catalog (CLI-3 / SAFE-1,
GITHUB-1/3, ROLES-CHAT-4, PLUGIN-3). `buildOpenAiTools` SHALL take an optional
`allowlist` and SHALL offer a dangerous plugin only when that allowlist names
it (exact name) or `includeDangerous` is set (a test seam no product caller
sets). `createTaskExecute` SHALL pass the run's effective allowlist (its
`allowlist` option, else `CORVIDINHO_ALLOWLIST`, which `task run` passes), so
for every `task run` (local CLI, Discord, `/session start`, `/work`,
schedules, WATCH, delegate workers) a dangerous plugin enters the model's
catalog only when the operator allowlisted it; an unlisted dangerous plugin
stays out and a call to it is refused as not offered (REQ-agent-128).
`shell-exec`, `node-exec`, `python-exec`, `cargo-exec` and the Fledge core
runs `fledge-lanes-run` and `fledge-run` (PLUGIN-1, REQ-plugins-461)
(`SAFE3_PENDING_TOOLS`) SHALL NOT be offered from the allowlist, even when
named, until the SAFE-3 decision on the shell and runners is taken: each
starts in the project dir, which is not a clamp, and a Fledge lane or task
runs whatever commands the project gives it. They still run through
`corvidinho plugins run`. The tier filter (`minTier`), the
ROLES-CHAT-2 role filter (a community role session gets no dangerous or
mutating tool, whatever the allowlist; a team session only what
REQ-agent-065 allows), the SAFE-9 autonomous filter,
catalog-only dispatch and the SAFE-1 / SAFE-4 / SAFE-5 / GITHUB-6 runtime
gates in `runPlugin` and the handlers SHALL be unchanged. With an empty
allowlist the catalog SHALL be exactly as before. No env var, config key,
flag, slash command or schema is added.

Acceptance Criteria
- At tool tier, an allowlist naming `github-issue-create`, `github-issue-comment`, `github-pr-create`, `github-pr-review`, `memory-forget` and `memory-override` offers all six; `danger-ping`, `web-fetch` and `discord-post-message` (dangerous, not named) are not offered; with no allowlist no dangerous plugin is offered.
- Every dangerous tool offered at tool or code tier is one the allowlist names.
- `files-delete` allowlisted is offered at code tier and not at tool tier.
- An allowlist naming `shell-exec`, `node-exec`, `python-exec`, `cargo-exec`, `fledge-lanes-run`, `fledge-run` and `files-delete` at code tier offers `files-delete` and none of the six; `fledge-lanes-run` and `fledge-run` are registered, dangerous, offered by `includeDangerous` at code tier, and `editsFilesUnreported` names them.
- A code-tier task run whose allowlist names the four Fledge core builtins offers only `fledge-lanes-list` and `fledge-lanes-validate` as `fledge-` tools; the model's call to `fledge-run` is refused as not offered, no fledge process starts and `unreportedEditTools` is absent.
- `actingIsAdmin: false` with every dangerous plugin allowlisted offers no dangerous or mutating tool.
- `task run` path (`createTaskExecute` without an `allowlist` option, non-interactive, GitHub dry run): with `CORVIDINHO_ALLOWLIST=github-pr-review` the model is offered `github-pr-review`, its call succeeds as a dry run, and its call to the unlisted `github-issue-create` is refused as not offered.
- An ADMIN role session (owner) with that allowlist is offered and runs `github-pr-review`; a community (non-ADMIN, not team) role session with the same allowlist is not offered it and no call succeeds.
