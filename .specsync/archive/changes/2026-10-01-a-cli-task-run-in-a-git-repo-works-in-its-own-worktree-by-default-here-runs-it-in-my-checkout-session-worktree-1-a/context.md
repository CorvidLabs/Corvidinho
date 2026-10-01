---
change: a-cli-task-run-in-a-git-repo-works-in-its-own-worktree-by-default-here-runs-it-in-my-checkout-session-worktree-1-a
artifact: context
---

# Context

Tracked under the M2 "Talk anywhere" milestone tracker #122 (slice
cli-worktree of the M3/M4 plan; the SESSION-WORKTREE issue #58 is closed).
Leif decided in the 2026-09-28 interview (round 9) that a CLI `task run` uses
a per-talk worktree by default in a git repo and `--here` opts into the
current checkout; that is captured on main as SESSION-WORKTREE-1.a in
`hi/session.md` ("A CLI task run in a git repo works in its own worktree by
default; --here runs it in my current checkout.", parent SESSION-WORKTREE-1).
Nothing new is captured in this change.

What was wrong on main (9ea4005): `corvidinho task run` always worked in
`process.cwd()`, the user's own checkout, so a local run's edits and branch
state landed in the working tree the user was using, while every Discord,
`/work` and schedule run already had its own worktree (`ensureTalkWorkspace`).

Constraints: specs only through SpecSync; no new env var or config key (the
worktree base is the existing `WORKTREE_BASE_DIR` default); no protocol bump
(the result field is additive); v1 off-chain; #232/#233 scope untouched; the
parallel stop-button-2 and spend-caps-c builds own `bridge.ts` onComponent and
the spend guard, so this change touches the spawn clients' argv only. Where
Leif's text leaves a question open, the conservative defaults in
`/home/user/coord/m34-defaults.md` (cli-worktree rows) are used and listed in
the PR under "Design choices pending Leif".
