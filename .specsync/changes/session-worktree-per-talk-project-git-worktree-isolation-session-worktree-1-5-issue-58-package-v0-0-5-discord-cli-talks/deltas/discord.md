---
module: discord
change: session-worktree-per-talk-project-git-worktree-isolation-session-worktree-1-5-issue-58-package-v0-0-5-discord-cli-talks
---

# Delta — discord (SESSION-WORKTREE isolation)

## Added

### REQUIREMENT REQ-discord-022

Corvidinho SHALL isolate Discord/CLI talks and scheduled single-project runs
in per-talk (or per-schedule-run) git worktrees or project-scoped directories
so filesystem and branch state do not bleed across concurrent conversations
(SESSION-WORKTREE-1..5). Soft session TTL and new-topic rules (SESSION-1..3 /
REQ-discord-019) SHALL remain; isolation SHALL NOT replace MEMORY for
cross-session continuity (SESSION-4 / SESSION-WORKTREE-2).

Project selection SHALL be explicit per talk or schedule. The default project
for a talk is the bridge `projectRoot` unless an optional `project` option is
supplied on existing `/session start` or `/work` (no new slash command names).
Once a session's project is set it SHALL NOT silently switch mid-conversation
(SESSION-WORKTREE-4). `/schedule` ticks SHALL resolve the schedule's `project`
and run the agent in that project's worktree/scope (align DISCORD-SCHEDULE).

Ending, abandoning, or TTL-purging a talk SHALL park or remove its worktree so
another talk never silently reuses it as cwd (SESSION-WORKTREE-3). Provenance:
steal corvid-agent `server/lib/worktree*` — Linux headless only; no ProcessManager
(SESSION-WORKTREE-5). Session worktree bookkeeping SHALL persist on shared
SQLite schema **v4**. Package version SHALL bump to **0.0.5**. Fixture tests
without live Discord.

Acceptance Criteria
- Worktree manager create/remove/park/prune under `.corvid-worktrees` (or `WORKTREE_BASE_DIR`).
- Concurrent talks get distinct worktree paths/branches.
- Continue-session keeps the same project/worktree; no silent mid-talk switch.
- Optional `project` on `/session start` and `/work`; schedule ticks use schedule.project scope.
- TTL purge / end parks or removes worktree (no silent leftover cwd reuse).
- SESSION soft TTL fixtures still pass; MEMORY continuity unchanged.
- Schema migrates to v4 with session worktree columns.
- Package `0.0.5`; docs/STATUS/CHANGELOG updated.
- Fixture tests + SpecSync + fledge verify green.

## Modified

### REQUIREMENT REQ-discord-009

Retain seven-command slash set including `/schedule`. Additionally: `/session start`
and `/work` MAY accept an optional `project` string (SESSION-WORKTREE-4). No new
slash command names.

Acceptance Criteria
- `buildSlashCommandBodies()` still seven commands; session start + work have optional `project`.
- Schedule/mute/unmute/prior DISCORD-4 bodies still present.
- Bodies remain fixture-testable without live Discord.

### REQUIREMENT REQ-discord-018

Retain `/schedule` inventory docs. Additionally document per-talk worktree isolation,
optional `project` on `/session start` and `/work`, schedule project scope, and
`WORKTREE_BASE_DIR` / `.corvid-worktrees` rooting.

Acceptance Criteria
- `docs/discord.md` lists `/schedule` and SESSION-WORKTREE behavior/env.
- Deny flowchart / mermaid-docs-only note unchanged in intent.

### REQUIREMENT REQ-discord-019

Retain SESSION durable store + soft TTL. Additionally persist optional worktree
fields (`project`, `worktree_path`, `worktree_branch`, `worktree_state`) on schema
v4; TTL purge parks/removes worktree before dropping the row.

Acceptance Criteria
- Schema v4 migration adds columns; reload restores worktree binding.
- Soft TTL purge parks/removes worktree then drops session row.
- Prior TTL fixtures still green.

### REQUIREMENT REQ-discord-020

Retain cooperative `/schedule` ticker. Additionally: ticks SHALL spawn with cwd
scoped to `schedule.project` worktree/scope and park/remove after the run.

Acceptance Criteria
- Tick resolves `schedule.project` → isolated cwd for `runChat`.
- After run, worktree parked/removed (no silent leftover reuse).
- Tick still returns without awaiting agent; concurrency cap unchanged.
