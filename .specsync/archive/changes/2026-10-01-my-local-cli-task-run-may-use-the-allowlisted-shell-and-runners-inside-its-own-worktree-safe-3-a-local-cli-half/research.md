---
change: my-local-cli-task-run-may-use-the-allowlisted-shell-and-runners-inside-its-own-worktree-safe-3-a-local-cli-half
artifact: research
---

# Research

- Sources: issue #83 (body; comments: the #324 rollup lists "SAFE-3.a: give
  `task run` its own per-run worktree, then build the local CLI half of the
  gate"), Leif's interview record `/home/user/coord/interview-2026-09-28.md`
  (round 2: SAFE-3 owner + allowlist + per-talk worktree; round 9: the CLI
  per-talk worktree; round 13: the shell starts without credentials), the
  slice entry `/home/user/coord/pr-safe3a-cli.json` and the safe3a-shell rows
  of `/home/user/coord/m34-defaults.md` (`--here` is not the talk's own
  worktree; non-git folders get no shell; delegate depth > 0 never inherits).
- `enterCliTaskWorkspace` (#338) returns `kind: "worktree"` only for a
  process that is not a spawned child (`isSpawnedTaskChild`: role session,
  WATCH / Discord session id, depth > 0), so `ws.dir` is always this run's
  own fresh `talk-cli_…` worktree.
- The shell, runners and Fledge core runs' child env is `runnerChildEnv` →
  `buildVerifyEnv`, which drops every `CORVIDINHO_ACTING_*` key but keeps
  `CORVIDINHO_DISCORD_SESSION_ID`, so a `task run` started from an owner's
  Discord shell stays in place (Discord session id) and is refused. From a
  local run's shell a nested `task run` would otherwise count as another local
  run (it makes a worktree outside the parent's, from the parent's worktree):
  every tool child's env (`runnerChildEnv`, `fledgeCoreChildEnv`, the Fledge
  plugin spawn) carries `CORVIDINHO_PROJECT_ROOT`, so the gate refuses a run
  that has it (`TOOL_CHILD_ENV`). A tool child that strips it itself is the
  runners' SAFE-3 residual.
- The must-ask gate (`src/plugins/must-ask.ts`) records the card on the
  shared approvals store and waits `MUST_ASK_CARD_TTL_MS`; only the bridge
  DMs it, so a CLI-only box lapses (SAFE-20) and the refusal says "with no
  bridge running it lapses". Tests shorten the TTL with `answerMustAsk("none",
  { ttlMs })`.
- REQ-cli-681 is unused (`grep -rn REQ-cli-681 specs .specsync` is empty;
  REQ-cli-680 is the last 68x id).
