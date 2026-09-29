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
