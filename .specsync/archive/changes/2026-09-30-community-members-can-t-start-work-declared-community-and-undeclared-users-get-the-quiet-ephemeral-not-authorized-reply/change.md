---
id: community-members-can-t-start-work-declared-community-and-undeclared-users-get-the-quiet-ephemeral-not-authorized-reply
state: archived
type: bug_fix
base_commit: 39767a8f72e42f1d30b9fac717708f6eb3f41b26
---

# Community members can't start /work: declared community and undeclared users get the quiet ephemeral not-authorized reply and no worktree, branch, work task or run, while the owner and team keep /work (IDENTITY-11.a, #65)

## Intent

Community members can't start /work: declared community and undeclared users get the quiet ephemeral not-authorized reply and no worktree, branch, work task or run, while the owner and team keep /work (IDENTITY-11.a, #65)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- A /work from a community member — declared community, a declared person with no role, or anyone undeclared (IDENTITY-12), including a muted or deny-listed team member and everyone when no owner is configured — gets only the ephemeral 'not authorized' reply the owner-only commands give (/announce channel, /schedule create, /admin), with no deferred public reply, no session, no git worktree or talk/* branch, no work task, no agent run (so no verify lane) and no PR step; the role comes from resolveDiscordActingRole over the owner config and the people list re-read when the command runs, so a promotion or demotion in the file applies to the next /work without a restart; the owner's and a declared team member's /work run unchanged (worktree, work flag, PR step); a community /work description that looks like an injection attempt still gets the SAFE-13 refusal and owner ping; tests/roles.community-no-work.test.ts fails on the base sources and passes on the branch

## No-spec Rationale

Not applicable
