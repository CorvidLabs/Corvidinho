---
change: in-a-specsync-repo-it-opens-and-works-a-specsync-change-for-its-edits-and-on-corvidinho-it-approves-and-archives-its
artifact: design
---

# Design

- **Repo ways** (`src/agent/repo-ways.ts`, new): `scanRepoWays(root, base)`
  reads the working tree (files) and HEAD plus the base commit (read-only
  `runGit` `cat-file` / `ls-tree`) and merges them: each way flag is OR-ed;
  the SpecSync policy (`sdd.json`: `enabled`,
  `require_change_for_meaningful_files`, `meaningful_paths`,
  `ignored_paths`, SpecSync's defaults when a list is missing) is merged
  fail-closed (enabled / required in any tree, meaningful union, ignored
  intersection; an unparseable file is enabled, required, everything
  meaningful). `repoWaysBase` is the merge-base with the remote default
  branch (`resolveBase`), else HEAD.
- **Coverage** (`sddUncovered`): changed paths that the policy counts as
  meaningful (longest matching entry wins between meaningful and ignored)
  and that no open change's `affected_paths` (file or dir prefix) and no
  change archived in the same diff covers. SpecSync's own `change audit`
  was not reused: it counts only verified changes as coverage and fails for
  unrelated reasons (an unapproved change), so it would block every run in
  a repo where a human approves.
- **Gate** (`src/agent/loop.ts`): planning scans once (base, ways line,
  `repoWays` into every attempt). Before the lane, the start scan merged
  with a scan now decides; an uncovered path is a failed verify with the
  note as the whole feedback and no lane run; unreadable fails closed. The
  lane and its AGENT-15 evidence verdict moved into `runLane` so the
  post-lifecycle re-run uses the same verdict.
- **Prompt** (`src/agent/execute.ts`): `ExecuteContext.repoWays` → `LoopArgs`
  → one fixed `renderRepoWaysBlock` in `runToolLoop`'s system prompt, before
  the closing reply rules. No other `runToolLoop` edit.
- **Tools** (`plugins/specsync/commands.ts`): `specsync-change-status`
  (read), `specsync-change-new` / `-answer` (mutating, code tier, team
  `/work`), `specsync-change-approve` / `-finalize` (dangerous, code tier,
  team `/work`, `agentTool: false`). New and answer refuse `--root` and a
  workflow that is off; new records the ids its spawn added (listing before
  and after) in the run ledger; answer checks hi citations against
  `hi export` in a hi repo. `spawnSpecsync` / `hi` look up the PATH in
  effect at the call.
- **Own-change lifecycle**: a per-cwd ledger (`beginSddRun` in `runTask`).
  After a green lane, `settleOwnSddChanges` runs approve then finalize
  (check, review, finalize) through `runPlugin` for each change the run
  opened, only on Corvidinho (`isCorvidinhoProject`: same git common dir as
  this code's checkout and origin github.com/CorvidLabs/Corvidinho); the
  ledger's verified mark is set only during that step, so the tools' own
  gate (`selfLifecycleRefusal`: not WATCH / schedule / worker / community,
  Corvidinho, own change, verified mark) passes only there. Then the lane
  runs again.
- **/work** (`src/work/pr.ts`): after the tests-deleted check,
  `scanRepoWays(worktree, mergeBase)` + `sddUncovered` over
  `startWorkspaceDiffFrom(worktree, mergeBase).changed()`; reason
  `sdd-uncovered`.
- **Catalog**: `PluginCommand.agentTool?: boolean` (`buildOpenAiTools` skips
  `false`); `TEAM_WORK_TOOLS` gains the four tools; `STATE_CHANGING_TOOLS`
  (AGENT-16) gains them; the tool-surface budget moves to ~9000 tokens.
