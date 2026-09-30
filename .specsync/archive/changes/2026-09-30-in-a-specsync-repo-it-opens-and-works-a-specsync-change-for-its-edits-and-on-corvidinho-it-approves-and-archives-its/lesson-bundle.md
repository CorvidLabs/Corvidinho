# Lesson bundle — in-a-specsync-repo-it-opens-and-works-a-specsync-change-for-its-edits-and-on-corvidinho-it-approves-and-archives-its

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: In a SpecSync repo it opens and works a SpecSync change for its edits, and on Corvidinho it approves and archives its own change once verify is green (AGENT-18 SpecSync clause, AGENT-18.a)
- **Kind**: Feature
- **Specs**: agent, plugins, discord
- **Paths**: hi/agent.md, INTENT.md, docs/DISCORD-GO-LIVE.md, docs/discord.md, plugins/specsync/api.ts, plugins/specsync/commands.ts, specs/agent/agent.spec.md, specs/agent/testing.md, specs/discord/discord.spec.md, specs/discord/testing.md, specs/plugins/plugins.spec.md, specs/plugins/testing.md, src/agent/execute.ts, src/agent/loop-guards.ts, src/agent/loop.ts, src/agent/tools.ts, src/agent/types.ts, src/agent/repo-ways.ts, src/plugins/roles.ts, src/plugins/types.ts, src/plugins/toolCost.ts, src/work/pr.ts, tests/roles.team.test.ts, tests/agent.repo-ways.test.ts
- **Acceptance**: AGENT-18 (captured on main; its SpecSync clause, partial: the hi-drafting and Trust clauses are later PRs) and AGENT-18.a (captured in this PR with hi from Leif's 2026-09-28 interview, round 13 of 2026-09-30): detectRepoWays(root, base) reads the SpecSync change workflow, hi and Trust from the session base, HEAD and the working tree (union, so a deletion or commit mid-run can't switch a way off); a run names the ways in one Text line and the tool loop gets one fixed prompt block; specsync-change-new / -answer (mutating, minTier 2, TEAM_WORK_TOOLS) refuse --root and a repo whose workflow is off, and in a hi repo an acceptance_criteria answer must cite hi ids hi export shows as captured; specsync-change-status is read-only; in a repo whose sdd.json requires a change for meaningful files, a changed meaningful path no open change covers fails the verify gate before the lane (retry with the note) and keeps /work from committing or pushing (sdd-uncovered); on Corvidinho only (the checkout this code runs from, origin github.com/CorvidLabs/Corvidinho) runTask, right after a green evidence-backed lane, runs specsync-change-approve then specsync-change-finalize (check, review, finalize) for the changes this run opened, through runPlugin (role, SAFE-1 allowlist, must-ask, SAFE-5), then runs the lane again; elsewhere the tools refuse with the human line and the run says the change stays open for a human; the tools are never offered to the model and refuse in WATCH, schedules, workers and community runs

## Evidence

- Verification commit: `beefaa59fcc6115fa24953a2be6d567d1278c7c4`
- Base commit: `d238d2d4e59deb3924042b0dacb52fc4479dfc76`
- Verified by: `specsync check --spec agent --spec discord --spec plugins`

## From the change's context.md

# Context

- Issue #89 (WORK: follow each repo's own lifecycle) tracks AGENT-18. Its
  scope: detect each repo's tooling and drive its steps — SpecSync
  `change new` → implement → `specsync check` → verify → archive; hi draft →
  ask → capture; Trust where configured. Leif's decision on #89 (2026-09-26):
  in other repos it follows that repo's own gates; Corvidinho keeps its
  "no Trust re-add" stance.
- AGENT-18 was captured on main from Leif's 2026-09-28 interview (round 3).
  This change builds its SpecSync clause only (the slice record
  `/home/user/coord/pr-repo-ways-1.json`); the hi guard and hi drafts
  (repo-ways-3/4) and Trust (repo-ways-2) are later PRs, so AGENT-18 stays
  partial.
- AGENT-18.a is captured in this change with `hi` (first commit) from the
  interview's round 13 (2026-09-30, SpecSync reach): "On Corvidinho it may
  approve and archive its own SpecSync change once verify is green; in other
  repos a human approves, reviews and finalizes." It differs from the
  conservative default in `/home/user/coord/m34-defaults.md` (approve,
  review and finalize always human), and follows PROCESS-3.
- Before this change the agent could only read SpecSync changes
  (`specsync-change-list`, `specsync-ship-status`, SPECSYNC-4): nothing
  detected which ways a repo uses, nothing opened a change for the agent's
  edits, and nothing stopped a run in a SpecSync repo from ending verified
  with edits no change covers — which SpecSync's own CI audit then rejects.
- Main has #308 / #321 (the real-diff gate and the tests-ran evidence
  verdict) and #324 / #325 (the SAFE-3.a shell gate and the AGENT-11
  fallback in `runToolLoop`); this change extends the `loop.ts` gate set and
  touches only the prompt-block region of `runToolLoop`.

## From the change's design.md

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
- **Records** (`plugins/files`): `isSddRecordPath` (the `*.json` directly in
  `.specsync/changes/<id>/`) is refused by files-write / -edit / -delete, so
  the coverage gate, the hi check and the human approval can't be got round
  by editing `state.json` or `approvals.json`; it is kept out of
  `isProtectedPath` so git-commit still stages their deletion on archive.

## From the change's testing.md

# Testing

Temp git repos, a talk-style linked worktree, a bare `origin` for /work, a
fake `specsync` (records argv; `change new` writes the change folder,
`finalize` archives it, ids starting `fail-<step>` fail) and a fake `hi`
(`hi export` JSON) on PATH, stub verify runners printing a `bun test`
summary. No network, no key, no real `specsync` or `hi`. "Corvidinho itself"
is a temp repo with origin github.com/CorvidLabs/Corvidinho that the code-only
seam `setCorvidinhoCheckoutForTests` names as this checkout.

Fail-on-base proof: with the base's (7090656)
`src/agent/{loop,execute,types,tools,loop-guards}.ts`,
`src/plugins/{roles,types}.ts`, `src/work/pr.ts` and
`plugins/specsync/{commands,api}.ts` swapped in (the new
`src/agent/repo-ways.ts` kept so the test file loads),
`bun test tests/agent.repo-ways.test.ts tests/roles.team.test.ts` gave
35 pass, 17 fail: 15 of the new file's 26 tests (every gate, prompt, tool,
approve / finalize, lifecycle and /work case; the base verifies uncovered
edits, has no change tools and opens the /work PR) and the two catalog tests
of `tests/roles.team.test.ts`. The 11 that pass are pure `repo-ways.ts`
units. Restored: all pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-518` | `tests/agent.repo-ways.test.ts` ("detectRepoWays") | all three ways found, none in a plain repo (no front matter, disabled `sdd.json`); removed from the working tree → HEAD keeps them; committed away → only the base keeps them; a disabled `sdd.json` in the tree still leaves the merged policy enabled and required; non-git reads the tree; ways line text and null. |
| `REQ-agent-518` | `tests/agent.repo-ways.test.ts` ("SpecSync coverage") | meaningful vs ignored (specific wins, defaults), unparseable fails closed, merged policies strict, file / dir coverage, archived-in-diff covers, archived-before does not, not required covers all. |
| `REQ-agent-518` | `tests/agent.repo-ways.test.ts` ("the verify gate …") | uncovered edit → `SpecSync gate:` note naming `src/app.ts` and `specsync-change-new`, no lane, `VerifyResult` false, retry feedback starts with the note; covered retry → lane once, verified; `ctx.repoWays` `{ sdd: true, hi: true, trust: false }`; deleting `sdd.json` and committing mid-run → failed, no lane; a plain repo unchanged (no ways line, no `repoWays`). Fail on the base. |
| `REQ-agent-518` | `tests/agent.repo-ways.test.ts` ("the tool loop gets one fixed prompt block") | the system prompt carries the SpecSync and hi block with `repoWays` and not without; Trust alone adds none. Fails on the base. |
| `REQ-agent-519` | `tests/agent.repo-ways.test.ts` ("runTask approves and archives …") | Corvidinho + allowlist: `change new`, `approve --actor corvid-agent`, `check`, `review --reviewer corvid-agent`, `finalize`, lane twice, archived, verified; another origin: only `new`, lane once, "stays open for a human"; no allowlist: SAFE-1 line, verified, another open change untouched; second lane fails → failed; failing approve → line with the reason, no finalize, verified. Fail on the base. |
| `REQ-agent-002` | `tests/agent.repo-ways.test.ts` (gate and lifecycle cases) | no lane call while a path is uncovered; lane once when covered; a second lane after the own-change steps. |
| `REQ-agent-065` | `tests/agent.repo-ways.test.ts` ("shape"), `tests/roles.team.test.ts` | approve / finalize never offered even allowlisted for the owner; team `/work` adds exactly files-write / files-edit / specsync-change-new / specsync-change-answer. The catalog test fails on the base. |
| `REQ-agent-086` | `tests/agent.loop-guards.test.ts` | every dangerous or mutating builtin, the four new tools included, is in exactly one set. |
| `REQ-plugins-518` | `tests/agent.repo-ways.test.ts` ("SpecSync change tools") | shapes; `SDD_OFF_REFUSAL`; `--root` refused, nothing spawned; `opened: ["fix-the-app"]` recorded in the ledger; `change status` argv; hi answers citing none / AGENT-99 / retired AGENT-2 refused with nothing spawned, AGENT-18.a spawns the joined answer, other questions and non-hi repos unchecked; `citedHiIds` families. Fail on the base. |
| `REQ-plugins-519` | `tests/agent.repo-ways.test.ts` ("Corvidinho is a fixed fact", "approve and finalize") | origin URL forms; look-alike repo not Corvidinho, the checkout and its worktree are, a changed origin is not; outside Corvidinho `HUMAN_LIFECYCLE_LINE` with nothing spawned; not this run's change, no verified mark, WATCH, schedule session, schedule stamp, worker, community refused; allowlisted approve spawns `change approve c1 --actor corvid-agent`; not allowlisted is a SAFE-1 denial. |
| `REQ-plugins-065` | `tests/roles.team.test.ts`, `tests/agent.repo-ways.test.ts` | `TEAM_WORK_TOOLS` exactly the six; new / answer allowed for team only with the work flag, never for community. Fails on the base. |
| `REQ-plugins-083` | `tests/agent.repo-ways.test.ts` ("file tools leave SpecSync's own records …") | files-write / files-edit / files-delete of a change's `state.json`, its `approvals.json` and a planted `state.json` refused (exit 2), file unchanged, nothing created, `sddUncovered` still names the edit; `tasks.md` and `deltas/agent.md` written. Fails with the base `plugins/files/commands.ts`. |
| `REQ-plugins-114` | `tests/fledge.plugins.test.ts` | the builtins plus a discovered Fledge plugin stay under the default budget with the new tools loaded. |
| `REQ-discord-518` | `tests/agent.repo-ways.test.ts` ("/work checks SpecSync coverage …") | uncovered → `sdd-uncovered` naming `src/app.ts`, no plugin call; archived on the branch → `git-commit` → `git-push` → `github-pr-create`; `sdd.json` deleted and committed on the branch → still `sdd-uncovered`. Fail on the base. |

## Where these lessons go

- `specs/agent/context.md`
- `specs/plugins/context.md`
- `specs/discord/context.md`
