---
change: session-worktree-per-talk-project-git-worktree-isolation-session-worktree-1-5-issue-58-package-v0-0-5-discord-cli-talks
artifact: testing
---

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
