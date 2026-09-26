# Lesson bundle — session-worktree-per-talk-project-git-worktree-isolation-session-worktree-1-5-issue-58-package-v0-0-5-discord-cli-talks

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: SESSION-WORKTREE per-talk/project git worktree isolation (SESSION-WORKTREE-1..5 / issue #58) + package v0.0.5: Discord/CLI talks and scheduled runs get isolated git worktrees so cwd/branch do not bleed; steal corvid-agent worktree lib Linux headless; soft TTL still applies; end/abandon parks or cleans; explicit project per talk/schedule never silent mid-conversation switch; wire session/work spawn + schedule ticks; fixture tests; SpecSync+fledge verify
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/worktree, src/discord, src/scheduler, src/store, tests, package.json, CHANGELOG.md, STATUS.md, docs
- **Acceptance**: Discord/CLI talks that do repo work and scheduled runs on project X each get an isolated git worktree (or project-scoped dir) under WORKTREE_BASE_DIR/.corvid-worktrees so cwd/branch do not bleed across concurrent talks (SESSION-WORKTREE-1/5); soft TTL/new-topic SESSION-1..3 still apply and isolation does not replace MEMORY (SESSION-WORKTREE-2); end/abandon/TTL purge parks or removes the worktree so another talk never silently reuses it as cwd (SESSION-WORKTREE-3); project is explicit per talk/schedule and never silently switches mid-conversation (SESSION-WORKTREE-4); schedule ticks use that project's worktree/scope; package bumped to 0.0.5; fixture tests + SpecSync + fledge verify green; no new slash commands; no ProcessManager; Linux headless only

## Evidence

- Verification commit: `bdca84018aef2efed89353675359ed7d82b606b2`
- Base commit: `6cb5f18ab909f4bc5e6529b8c29df121e0833c4e`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins`

## From the change's context.md

# Context

Leif confirmed SESSION-WORKTREE-1..5 (captured via #60 into `hi/session.md`).
Impl issue #58. Main tip is v0.0.4 (`6cb5f18`) with MEMORY schema v3, `/schedule`,
and SESSION durable store. Discord presence already shows v0.0.4 live.

Problem: Discord/CLI talks and scheduled runs currently spawn the agent with a
shared bridge `projectRoot` cwd — concurrent talks can bleed edits and branch
state into each other.

Cut: steal corvid-agent `server/lib/worktree*` (Linux headless only). Soft session
TTL / new-topic (SESSION-1..3) stay intact; isolation is filesystem/git context,
not MEMORY continuity (SESSION-4 / SESSION-WORKTREE-2). Align schedule
single-project path so ticks on project X use that project's worktree/scope.

Standing constraints:
- Do not invent slash commands beyond HI (optional `project` on existing
  `/session start` and `/work` is OK for SESSION-WORKTREE-4 explicit selection)
- Do not break Discord ingress or schedule ticker
- Do not restart live bridge/watch from this change
- Prefer separate agent worktree under `/workspace` (not Corvidinho-run)
- Eager package bump to **0.0.5** in the same ship
- Made with Corvidinho attribution on PR/issue traffic

## From the change's design.md

# Design

## Worktree manager (`src/worktree/`)

- `getWorktreeBaseDir(projectWorkingDir)` → `WORKTREE_BASE_DIR` or
  `{dirname(project)}/.corvid-worktrees`
- `createWorktree({ projectWorkingDir, branchName, worktreeId })` — prune stale,
  `git worktree add -b`, return `{ success, worktreeDir, error? }`
- `removeWorktree(projectDir, worktreeDir, { cleanBranch? })` — idempotent
- `parkWorktree(...)` — remove worktree dir from active use but keep branch when
  it has commits (or rename/mark parked); ensure path is not reused as cwd
- `pruneWorktrees`, `generateTalkBranchName(sessionId)` → `talk/{sessionPrefix}`
- `resolveProjectDir(project, { defaultProjectRoot })` — absolute existing path,
  else path under default root; must be a directory
- `ensureTalkWorkspace({ projectWorkingDir, sessionId })` — if git repo: create
  worktree; else: mkdir project-scoped dir under base (`scoped-{id}`)

## Session binding

`SessionStub` gains optional:
- `project` (resolved absolute path; frozen for talk lifetime)
- `worktreePath`, `worktreeBranch`, `worktreeState`

Schema v4 adds columns on `discord_sessions`. On create (mention/`/session`/`/work`):
resolve project (explicit option or default `projectRoot`), ensure workspace,
persist fields. Continue-session reuses the same project/worktree (no switch).

TTL purge / abandon: `parkOrRemoveSessionWorktree(session)` then delete row.

## AgentClient

`runChat` accepts optional `cwd` (and optional `project`). Spawn uses per-call
cwd when set; bridge default remains `projectRoot` for non-isolated paths.

## Schedule ticks

`SchedulerService.runOne`: resolve `schedule.project`, `ensureTalkWorkspace` with
id `schedule_{schedule.id}_{runId}`, spawn agent with that cwd, park/remove after
run finishes (keep branch if commits ahead of main).

## Slash (no new commands)

Optional string option `project` on `/session start` and `/work` only.
`/schedule create` already requires `project`.

## Spec ownership

`src/worktree/*` listed under discord module files for this change (same pattern
as `src/store/` / `src/scheduler/`). Physical path stays reusable.

## From the change's testing.md

# Testing

- Unit: create two worktrees from a temp git repo → distinct dirs/branches;
  remove/park leaves no reusable active cwd; stale cleanup before recreate.
- Session: create with default project → worktree bound; continue keeps same
  project; explicit project option freezes path; TTL purge parks/removes.
- Two concurrent sessions → different worktree paths (no bleed).
- Schedule tick: project X → agent cwd under that project's worktree base;
  after run worktree parked/removed.
- Slash bodies: optional `project` on session start / work; no new command names.
- Soft TTL tests still green (SESSION-1..4 intact).
- `bun test`, `bunx tsc --noEmit`, `specsync check`,
  `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-009 | `tests/discord.session-worktree.test.ts` — slash bodies still seven commands; optional `project` on session start + work |
| REQ-discord-018 | `docs/discord.md` SESSION-WORKTREE section + optional project on `/session start`/`/work`; WORKTREE_BASE_DIR noted |
| REQ-discord-019 | `tests/discord.session-store.durable.test.ts` still green; TTL purge parks worktree (`tests/discord.session-worktree.test.ts`) |
| REQ-discord-020 | `tests/scheduler.service.test.ts` + schedule worktree tick in `tests/discord.session-worktree.test.ts` |
| REQ-discord-022 | `tests/worktree.test.ts` + `tests/discord.session-worktree.test.ts` — isolation, park/cleanup, explicit project, schedule scope |

## Automated coverage

- `bun test tests/worktree.test.ts tests/discord.session-worktree.test.ts tests/scheduler.service.test.ts tests/discord.session-store.durable.test.ts tests/discord.schedule.test.ts`
- `bunx tsc --noEmit`
- `specsync check`
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/discord/context.md`
