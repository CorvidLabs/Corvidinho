---
change: verification-can-t-be-skipped-and-the-real-diff-since-the-talk-started-decides-what-changed-agent-14-agent-15-agent-15
artifact: context
---

# Context

Issue #85 (M3 "Real dev teammate"), slice verify-gate-1 of the M3/M4 plan.
Leif confirmed AGENT-14 and AGENT-15 as written in the 2026-09-28 interview
(round 2: "no opt-outs: remove `--no-verify` and
`verify_before_complete = false`; one gate for chat, WATCH, schedules,
work; verified = real diff + tests ran + none deleted"), and AGENT-15.a in
round 12 (2026-09-29): "After a restart or retry, 'verified' still covers
every edit made since the talk started, including ones an earlier attempt
left." AGENT-14 and AGENT-15 were already in `hi/agent.md`; this PR captures
AGENT-15.a with `hi` (its own commit) and builds AGENT-14, the diff half of
AGENT-15 and AGENT-15.a.

What was wrong on main (5aaf7f0 / 84b847a):

- `task run --no-verify` (src/cli.ts) and `[corvidinho] verify_before_complete
  = false` (src/agent/config.ts, read from the spawn cwd's fledge.toml, so
  any project or talk worktree could switch the gate off on every surface)
  skipped the gate; `RunTaskOptions.verifyBeforeComplete` was a programmatic
  skip.
- `filesChanged` was the union of tool claims and the real diff, so a claim
  git does not show still counted as a change, and the demo stub claimed
  `src/cli.ts` although it changes nothing.
- A run that ended blocked (ask, spend cap), failed or cancelled left its
  edits in the talk worktree; the next run (the bridge resumes with a fresh
  `task run`) snapshotted them as start dirt, so a resume that changed
  nothing more ended `done` with `verifySkipped` on edits never verified,
  or that failed verify.

Constraints: specs only through SpecSync; no new env var, config key, slash
command, table, schema bump or NDJSON field; `src/discord/bridge.ts` and the
forget card untouched (other PRs in flight); #232/#233 scope untouched; the
tests-ran and none-deleted half of AGENT-15 is the next slice (verify-gate-2).
Conservative defaults for open points come from
`/home/user/coord/m34-defaults.md` (slice verify-gate) and are listed in
the PR under "Design choices pending Leif".
