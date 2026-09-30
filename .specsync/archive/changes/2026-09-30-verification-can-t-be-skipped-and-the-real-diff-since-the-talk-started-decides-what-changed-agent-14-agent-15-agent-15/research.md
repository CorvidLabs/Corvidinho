---
change: verification-can-t-be-skipped-and-the-real-diff-since-the-talk-started-decides-what-changed-agent-14-agent-15-agent-15
artifact: research
---

# Research

- Sources: issue #85 (body and progress comments), Leif's interview record
  `/home/user/coord/interview-2026-09-28.md` (round 2: AGENT-14/15 as
  written, no opt-outs; round 12: AGENT-15.a), the M3/M4 slice record
  (`/home/user/coord/m34-scope-all.json`, key `verify-gate`, split PR 1) and
  the conservative defaults (`/home/user/coord/m34-defaults.md`).
- Every LLM run reaches `runTask` through `task run` (src/cli.ts): Discord
  chat and button resumes (`src/discord/agent-client.ts`), `/session` and
  `/work` (command handlers), schedules (`src/scheduler/service.ts` with the
  bridge's or daemon's spawn client), WATCH (`src/watch/agent-client.ts`) and
  delegate / council workers. None passes `--no-verify` today (argv tests),
  so removing the CLI flag and the config key is enough for "one gate".
- Talk worktrees: `ensureTalkWorkspace` names them `talk-<prefix>-<digest>`
  (Discord sessions) or `talk-<runKey>` (schedules) under
  `.corvid-worktrees` / `WORKTREE_BASE_DIR`; git names a linked worktree's
  admin dir after the worktree's basename, so `<common>/worktrees/talk-*`
  identifies them without a new setting. Files in that admin dir are never
  part of `git status` or a diff.
- A blocked run returns before the loop reads the diff; the bridge resumes it
  as a fresh `task run` whose start snapshot holds the blocked run's edits as
  dirt (`workspace-diff.ts` compares only against start), so on main a
  resume that changes nothing ends `done` with `verifySkipped`.
- `resolveBase` (src/work/pr.ts) already gives the base branch and
  merge-base for `/work`; moved unchanged so both callers share it.
- Test hygiene: with the gate always on, a real-CLI `task run` in the repo
  (or in a talk worktree of it, when the bot verifies Corvidinho itself)
  would snapshot the repo and could start the repo's own lane from inside
  `bun test`; every such test now runs in a scratch project.
