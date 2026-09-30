---
change: verification-can-t-be-skipped-and-the-real-diff-since-the-talk-started-decides-what-changed-agent-14-agent-15-agent-15
artifact: design
---

# Design

- **No switch (AGENT-14).** `AgentConfig` is `{ maxRetries }`;
  `parseCorvidinhoSection` reads only `max_retries`; `removedVerifyKeys(cwd)`
  names a removed `[corvidinho]` key for doctor. `RunTaskOptions` loses
  `verifyBeforeComplete`. `runTask` always starts the workspace tracker and
  decides `wantVerify` = real-diff paths listed, or a ghost claim, or an
  unreadable diff, or the REQ-agent-502 non-git rule, or a verify already
  failed in this run. Otherwise it emits `NOTHING_TO_VERIFY_NOTE` and ends
  `done` with `verifySkipped`.
- **CLI.** `parseGlobalFlags` returns `removedFlag` for `--no-verify` read
  as a flag (same places the old flag was read: never the `--task` value,
  never after `plugins run <name> --`). `main` refuses it first, before
  `--project` and help, with `RemovedFlagError` through `reportCliError`
  (one scrubbed line, hint, exit 1, `{ ok:false, error }` with JSON). Help
  and `TASK_RUN_USAGE` drop it. Doctor pushes
  `removedVerifyKeyDoctorCheck` (`[warn] verify-gate`) when the key is set.
- **Real diff alone (AGENT-15).** With a tracker, tool claims never join
  `filesChanged`; real-diff paths join as a union (cap 1000, the cap now
  counts all fresh paths). Claims git does not show are ghosts: kept in a
  run-wide set, named once in a note, and they force the lane. With no
  tracker (non-git or unreadable start snapshot) the old tool-claim path and
  REQ-agent-502 are unchanged. The demo stub claims nothing.
- **Carried baseline (AGENT-15.a).** `resolveBase` moves from
  `src/work/pr.ts` to `src/worktree/base.ts` (unchanged logic; `openWorkPr`
  imports it). `talkWorktreeGitDir(top)` reads the `.git` file of a linked
  worktree and accepts only an admin dir `<common>/worktrees/talk-*`
  (Discord and schedule talks are named `talk-…`). The verified marker
  `corvidinho-verified` lives in that admin dir, so it is never part of a
  diff. `ensureTalkWorkspace` writes it for a new talk.
  `startWorkspaceDiff` takes it away at run start: present → normal
  run-start snapshot; absent or not removable → `carried` tracker whose
  baseline is `resolveBase`'s merge-base with an empty dirt map (every dirty
  path and every path changed since the merge-base counts); no base → a
  carried tracker whose `changed()` is null (verify anyway). `runTask`
  wraps the loop and calls `settle(done)` once: write the marker (O_NOFOLLOW)
  on `done`, remove it otherwise, so a crash, block, failure or cancel all
  leave the next run carried. Polarity is chosen so every failure mode
  (crash, unwritable marker, pre-upgrade worktree) verifies more, never
  less. The caller's own checkout (not a `talk-*` linked worktree) keeps
  the run-start snapshot.
- **One gate.** Chat, button resumes, `/session`, `/work`, schedules, WATCH
  and delegate workers all run `task run`, which is `runTask` +
  `defaultVerifyRunner`; none can skip it now. /work's pre-push lane is
  unchanged and still runs when the run did not report `verified`.
- **Tests never recurse into the repo's own lane.** Every real-CLI
  `task run` test runs in a scratch non-git project or a temp talk
  worktree with a fake `fledge`; in-process runs with `cwd` in the repo
  stub `workspaceDiff` and `verifyRunner`.
