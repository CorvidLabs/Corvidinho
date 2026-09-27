---
change: scope-session-list-to-the-acting-member-and-hide-host-paths-from-non-owners
artifact: testing
---

# Testing

Fixture tests only: an in-memory `SessionStore` rooted at a temp non-git
directory (an absolute host path), an in-memory `ScheduleStore`, the echo
agent and slash dispatch through `handleSlashInteraction`. No Discord, no
network, no token.

`tests/discord.session-list-scope.test.ts` (sessions for alice, bob and the
owner "boss"):

- **Member sees only own.** bob's `/session list` is "Active sessions (1)"
  with his id and topic, and none of alice's or the owner's ids, mentions or
  topics.
- **Member with none.** carol gets "No active sessions." and no id.
- **No absolute paths for a member.** bob's reply has neither the temp project
  root nor `tmpdir()`, shows the project's basename, and has no backticked
  string starting with `/`.
- **Owner sees all.** boss gets "Active sessions (3)" with every id, mention,
  topic and the full project path.
- **No owner configured (IDENTITY-3).** Nobody is ADMIN; "boss" sees only
  their own session.
- **`/status` for a member** is counts-only: "Active sessions: 3", no ids,
  mentions, topics or project path.
- **`/schedule list`** shows a member `Project:` with the basename and not the
  absolute path; the owner sees the full path.
- **`projectLabel`** unit cases (absolute, trailing slash, relative name,
  `owner/repo`, `/`, blank, undefined).

## Before and after

- **Before the fix** (`main` handlers, same behaviour tests without the
  `projectLabel` unit block): 5 fail, 2 pass. The passing two are "owner
  sees all" and "`/status` counts-only", which already held.
- **After the fix:** 8 pass, 0 fail. `tests/discord.slash.test.ts`,
  `tests/discord.schedule.test.ts`, `tests/discord.session-worktree.test.ts`
  and `tests/discord.slash-ask7.test.ts` still pass.

Also run: `bun test`, `bunx tsc --noEmit`,
`specsync check --require-coverage 100` and
`fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-418` | `tests/discord.session-list-scope.test.ts` | A member's `/session list` shows only their own sessions, no other user's id, mention or topic, and the project name instead of the absolute host path; a member with none gets "No active sessions."; the owner gets every session with full paths; no owner means nobody is ADMIN; `/status` stays counts-only; `/schedule list` shows a member the project name and the owner the full path. 5 fail on `main`, all pass after. |
| `REQ-discord-201` | `tests/discord.slash.test.ts` | Channel and actor gates and the existing `/session list` empty/populated case pass unchanged. |
