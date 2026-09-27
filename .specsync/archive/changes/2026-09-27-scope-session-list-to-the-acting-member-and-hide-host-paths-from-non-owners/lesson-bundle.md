# Lesson bundle — scope-session-list-to-the-acting-member-and-hide-host-paths-from-non-owners

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Scope /session list to the acting member and hide host paths from non-owners
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/discord/command-handlers/session.ts, src/discord/command-handlers/schedule.ts, src/discord/list-scope.ts, tests/discord.session-list-scope.test.ts, specs/discord/discord.spec.md
- **Acceptance**: A non-ADMIN member's /session list shows only sessions whose owner user id matches the acting user (SESSION-MULTI-1); no other user's session id, mention or topic; project shown as name, never an absolute host path. The owner (ADMIN, IDENTITY-2) keeps the full list with every session and its full project path. No owner configured means nobody is ADMIN, so everyone sees only their own (IDENTITY-3). /schedule list shows a member the project name only; /status stays counts-only. Regression tests fail on main and pass after.

## Evidence

- Verification commit: `e3bc7a78c82f3d3b3e6b43d6733a35d42e2f0408`
- Base commit: `3cdbb5c7cc469fe3d9fbaae991f58d69326da9dd`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

An end-to-end check of `origin/main` (3cdbb5c) found that `/session list`
run by any allowlisted non-owner returned every user's sessions: session ids,
other users' `<@mention>`s, topics (for `/work`, the first 120 chars of the
task description) and the absolute host project path. The cause is
`handleSessionList` in `src/discord/command-handlers/session.ts`, which
formatted `ctx.store.list()` unfiltered and printed `session.project`,
which the store resolves to an absolute directory.

This contradicts SESSION-MULTI-1 (each user has their own session, no shared
history across people) and the two-tier ROLES-CHAT model (non-owners are
read/chat only; only the owner is ADMIN, IDENTITY-2; empty owner means
nobody is ADMIN, IDENTITY-3).

Other listing surfaces checked: `/status` prints counts only (no ids,
mentions, topics or paths); `/agents` is static; `/work` has no list
subcommand. `/schedule list` (open to members by DISCORD-SCHEDULE-2) printed
the schedule's `project` verbatim, which can be an absolute host path.

## From the change's design.md

# Design

New helper module `src/discord/list-scope.ts`:

- `actorIsAdmin(ctx, interaction)` — the same `resolvePermissionLevel` call
  the dispatcher and handlers already use, `>= PermissionLevel.ADMIN`.
- `projectLabel(project)` — trims and drops trailing slashes; an absolute
  path becomes its last segment, a relative name is kept, empty/`/` is
  `undefined`.

`handleSessionList` resolves ADMIN at handler time. ADMIN keeps the old
output unchanged (every session, full project path). Anyone else gets only
sessions whose `userId` equals the acting user id, with the project shown as
`projectLabel`. A member with no own sessions gets the same
"No active sessions." line as an empty store, so nothing about other users'
activity is revealed. The header and line shape are unchanged.

`/schedule list` passes `fullProjectPath = requireAdmin(...)` to
`formatScheduleLine`; members see `projectLabel(project)`.

No new slash command, option, env var, table or column. The session store
and `list()` are unchanged; `/status` is unchanged.

## From the change's testing.md

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
- **Legacy admin lists (IDENTITY-2).** With `adminUserIds` / `adminRoleIds`
  naming alice and her role, alice still sees only her own session and no
  absolute path: only the configured owner is ADMIN.
- **No owner configured (IDENTITY-3).** Nobody is ADMIN; "boss" sees only
  their own session.
- **`/status` for a member** is counts-only: "Active sessions: 3", no ids,
  mentions, topics or project path.
- **`/schedule list`** shows a member `Project:` with the basename and not the
  absolute path; the owner sees the full path.
- **`projectLabel`** unit cases (absolute, trailing slash, relative name,
  `owner/repo`, `/`, blank, undefined).

## Before and after

- **Before the fix** (`main` handlers with `list-scope.ts` present): 6 fail,
  3 pass. The passing three are "owner sees all", "`/status` counts-only"
  and the `projectLabel` unit block, which already held.
- **After the fix:** 9 pass, 0 fail. The store is built without worktree
  ensure and each temp project root is removed after its test, so the file
  leaves nothing behind in the temp dir. `tests/discord.slash.test.ts`,
  `tests/discord.schedule.test.ts`, `tests/discord.session-worktree.test.ts`
  and `tests/discord.slash-ask7.test.ts` still pass.

Also run: `bun test`, `bunx tsc --noEmit`,
`specsync check --require-coverage 100` and
`fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-418` | `tests/discord.session-list-scope.test.ts` | A member's `/session list` shows only their own sessions, no other user's id, mention or topic, and the project name instead of the absolute host path; a member with none gets "No active sessions."; the owner gets every session with full paths; legacy admin user/role lists grant no wider list; no owner means nobody is ADMIN; `/status` stays counts-only; `/schedule list` shows a member the project name and the owner the full path. 6 fail on `main`, all pass after. |
| `REQ-discord-201` | `tests/discord.slash.test.ts` | Channel and actor gates and the existing `/session list` empty/populated case pass unchanged. |

## Where these lessons go

- `specs/discord/context.md`
