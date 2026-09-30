# Lesson bundle — verification-can-t-be-skipped-and-the-real-diff-since-the-talk-started-decides-what-changed-agent-14-agent-15-agent-15

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Verification can't be skipped and the real diff since the talk started decides what changed (AGENT-14, AGENT-15, AGENT-15.a): task run refuses --no-verify, [corvidinho] verify_before_complete is ignored, filesChanged comes from the real git diff alone (a claimed path git does not show still runs the lane), and a talk worktree whose last run did not end verified verifies from the talk branch's merge-base
- **Kind**: Feature
- **Specs**: agent, cli, discord, watch
- **Paths**: AGENTS.md, INTENT.md, hi/agent.md, docs/WATCH.md, docs/discord.md, fledge.toml, src/agent/config.ts, src/agent/execute.ts, src/agent/index.ts, src/agent/loop.ts, src/agent/types.ts, src/agent/workspace-diff.ts, src/cli.ts, src/discord/agent-client.ts, src/doctor.ts, src/watch/agent-client.ts, src/work/pr.ts, src/worktree/base.ts, src/worktree/index.ts, src/worktree/manager.ts, tests/agent.allowlisted-dangerous.test.ts, tests/agent.ask.test.ts, tests/agent.cli.test.ts, tests/agent.config.test.ts, tests/agent.execute.test.ts, tests/agent.loop.test.ts, tests/agent.ndjson-spawn.test.ts, tests/agent.spend-ask.test.ts, tests/agent.tool-loop.test.ts, tests/cli.doctor-truth.test.ts, tests/cli.plugins-run-argv.test.ts, tests/cli.project-path.test.ts, tests/cli.task-argv.test.ts, tests/agent.verify-gate.test.ts, tests/fixtures/talk-worktree.ts, specs/agent/agent.spec.md, specs/agent/testing.md, specs/cli/cli.spec.md, specs/cli/testing.md, specs/discord/discord.spec.md, specs/discord/testing.md, specs/watch/watch.spec.md, specs/watch/testing.md
- **Acceptance**: AGENT-14 (captured) and AGENT-15.a (captured with hi in this PR from Leif's 2026-09-28 interview record, round 12) plus the diff half of AGENT-15 hold: corvidinho --no-verify (anywhere it is read as a Corvidinho flag, never --task text or plugins run args after --) exits 1 before anything runs with one scrubbed 'corvidinho: --no-verify was removed: verification can't be skipped (AGENT-14)' line and a hint, or { ok: false, error } on stdout with --json, and help and TASK_RUN_USAGE no longer list it; a project fledge.toml that sets [corvidinho] verify_before_complete = false is ignored (runTask and the real CLI still run the lane on a real edit) and doctor prints one [warn] verify-gate line naming the key; AgentConfig and RunTaskOptions have no verifyBeforeComplete; runTask always takes the git snapshot; a run that changed nothing ends done with verifySkipped=true and exactly one 'Verify gate: no changes, nothing to verify.' Text event; in a git work tree filesChanged holds only real-diff paths (union across attempts, capped at 1000) and a tool-claimed path git does not show is left out but still runs the lane with one note naming it; a non-git cwd or unreadable start snapshot keeps tool-reported files plus the REQ-agent-502 fail-closed rule; in a linked talk worktree (git admin dir worktrees/talk-*) a run that follows one that ended blocked, failed or cancelled, or a process that died mid-run, verifies every edit since the talk started from the talk branch's merge-base (resolveBase, moved from src/work/pr.ts into src/worktree/base.ts and shared with /work) with one note, a base git cannot find verifies anyway, a new talk worktree and a run after a done run start from their own snapshot, and the caller's own checkout keeps the run-start baseline; the demo stub claims no files; AGENTS.md, docs/discord.md, docs/WATCH.md and fledge.toml no longer mention the opt-outs; tests/agent.verify-gate.test.ts and the rewritten CLI and loop tests fail on the base sources and pass on the branch

## Evidence

- Verification commit: `93dedcbd0d247647db8c3da29653790ef7351f70`
- Base commit: `38985d86b47da69a522285b25ac198671e4567e6`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec watch`

## From the change's context.md

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

## From the change's design.md

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

## From the change's testing.md

# Testing

Temp git repos, talk worktrees made by the product's own
`ensureTalkWorkspace`, scratch non-git projects, stub verify runners and a
fake `fledge` on PATH. No network, no key, and no test runs the repo's own
snapshot or verify lane (every real-CLI `task run` runs in a scratch project
or a temp talk worktree; in-process runs with `cwd` in the repo stub
`workspaceDiff` and `verifyRunner`), so the lane never recurses into
`bun test`.

Fail-on-base proof: with the base's (84b847a, same files as 5aaf7f0) 14
source files swapped in (`src/agent/{config,execute,index,loop,types,workspace-diff}.ts`,
`src/cli.ts`, `src/doctor.ts`, `src/work/pr.ts`,
`src/worktree/{index,manager}.ts`, both agent clients, `fledge.toml`;
the new `src/worktree/base.ts` kept so imports resolve),
`bun test tests/agent.verify-gate.test.ts tests/agent.cli.test.ts
tests/agent.config.test.ts tests/agent.loop.test.ts
tests/agent.allowlisted-dangerous.test.ts tests/cli.task-argv.test.ts
tests/cli.doctor-truth.test.ts` gave 86 pass, 23 fail (22 tests plus
`tests/agent.config.test.ts`, which cannot load on the base: no
`removedVerifyKeys`); restored, 115 pass, 1 skip (pre-existing), 0 fail.
The two verify-gate tests that pass on the base are guards: the
`talkWorktreeGitDir` helper cases and "the caller's own checkout keeps the
run-start baseline".

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-015` | `tests/agent.verify-gate.test.ts` ("'verified' covers every edit since the talk started") | New talk worktree: marker present, first no-change run `done` with the "no changes" note and no carried note. Blocked run edits `app.ts` → no marker; the resumed no-change run runs the lane once in the worktree, `filesChanged` `["app.ts"]`, carried note, `done` verified, marker back; the next no-change run skips. Failed-verify run → the next no-change run verifies again and fails. A shell commit left by a provider-error run is carried (`["lib.ts"]`). A cancelled run's edit and a "died" run (`startWorkspaceDiff` took the marker, never settled) are carried. Base branch renamed away → verify anyway with the unreadable-diff note. Caller's own checkout: a blocked run's edit is not carried (guard). All but the last fail on the base (the resume ends `done` with `verifySkipped`). |
| `REQ-agent-015` | `tests/agent.verify-gate.test.ts` ("delegate and council workers leave the marker to their lead") | The lead took the marker and edited `app.ts`. A `{ nested: true }` worker that changes nothing runs no lane and ends `done` (`verifySkipped`); one that edits `lib.ts` runs the lane once, lists only `lib.ts`, ends `done` verified; the marker stays absent, so the next top-level run (the lead died) carries `["app.ts", "lib.ts"]` with the carried note. A nested `done` leaves a marker as it was and a nested `failed` removes it. The real CLI with `CORVIDINHO_DELEGATE_DEPTH=1` in a carried talk worktree exits 0, `done`, `filesChanged` `[]`, never starts the fake `fledge` and writes no marker. The first and third fail on the pre-fix branch (the worker took the carried baseline, ran the lane on the lead's edit and wrote the marker); the second is a guard. The other real-CLI talk-worktree tests pin `CORVIDINHO_DELEGATE_DEPTH=""`, so a worker's verify lane running this suite still sees a top-level run. |
| `REQ-agent-015` | `tests/agent.verify-gate.test.ts` ("the talk verified marker") | `talkWorktreeGitDir`: the talk worktree's admin dir; null for the main checkout, a non-`talk-` linked worktree and a missing dir. `takeTalkVerified` true once then false; a symlink in the marker's place reads false and a `done` settle never writes through it (target unchanged). A marker planted during a run that ends `failed` is removed. |
| `REQ-agent-003` | `tests/agent.verify-gate.test.ts`, `tests/agent.allowlisted-dangerous.test.ts` | A committed `fledge.toml` with `verify_before_complete = false` in a temp repo: runTask (no config passed) runs the lane once and ends `failed`. Non-git Fledge run whose project sets the key: lane runs once, `failed`. Both fail on the base (skipped, `done`). |
| `REQ-agent-003` | `tests/agent.loop.test.ts` | A run that reports a changed file verifies with no option and ends `failed` on a failing lane; a run that changed nothing never calls the runner, ends `done` with `verifySkipped` and exactly one `Verify gate: no changes, nothing to verify.` event (fails on base: no note). The `workspaceDiff` seam is called once per run and a real change is verified. |
| `REQ-agent-085` | `tests/agent.verify-gate.test.ts` ("the real git diff decides") | Claims `dist/out.js` (gitignored, written), `app.ts` (edited), `ghost.ts` (never written): `filesChanged` `["app.ts"]`, lane runs once, one note naming `dist/out.js, ghost.ts`. A run whose only change is a claim: lane runs, the retry after its failure runs it again, `filesChanged` `[]`. Both fail on the base (claims listed). |
| `REQ-agent-085` | `tests/agent.loop.test.ts` (huge diff), `tests/agent.execute.test.ts`, `tests/agent.tool-loop.test.ts` | 30001 changed paths with a claimed `package.json`: 1000 listed (`package.json` first), the note counts 30000 unreported and "1000 of the 30001"; the NDJSON result line still parses. The demo execute reports `[]`. Existing real-diff cases (shell edit, untracked, deleted, same-size dirty edit, shell commit, unborn HEAD, subdir cwd, pre-run dirt, gitignored-only, non-git) pass unchanged. |
| `REQ-agent-242` | `tests/agent.loop.test.ts` | "execute error with no files changed is still failed"; a failed verify then retries that change no files verify every attempt and end `failed`. |
| `REQ-cli-085` | `tests/agent.cli.test.ts` | `task run --no-verify --task "fix it"`: exit 1, stdout empty, stderr `corvidinho: --no-verify was removed: verification can't be skipped (AGENT-14)` + `hint: run the command without it…`, no planning, fake `fledge` never started; `--no-verify doctor` refused the same way; `--json` and `--output json` print exactly `{ ok: false, error }`. Help has no `--no-verify`. All fail on the base (flag accepted). |
| `REQ-cli-085` | `tests/cli.doctor-truth.test.ts`, `tests/agent.config.test.ts` | A ready project whose `fledge.toml` sets the key: `[warn] verify-gate: fledge.toml [corvidinho] verify_before_complete is ignored — verification can't be turned off (AGENT-14); remove the key`, "All checks passed.", exit 0; without the key no `verify-gate` line. `removedVerifyKeys` names the key only under `[corvidinho]`; this repo's `fledge.toml` no longer sets it. |
| `REQ-cli-007` | `tests/agent.verify-gate.test.ts` (real CLI) | A carried talk worktree whose `fledge.toml` sets the key false: `task run --task demo --json` runs the fake lane (`lanes run verify --non-interactive`), exit 1, `failed`, `filesChanged` `["app.ts", "fledge.toml"]`. Fails on the base (skipped, exit 0). |
| `REQ-cli-006` | `tests/agent.cli.test.ts`, `tests/agent.ndjson-spawn.test.ts` | Scratch project: `task run --json` exit 0, `done`, `verifySkipped`, `filesChanged` `[]`, one "no changes" event, fake `fledge` never started; the pretty `--json` document and the ndjson stream (= `--json` result) hold without `--no-verify`. |
| `REQ-cli-143` | `tests/cli.task-argv.test.ts`, `tests/cli.plugins-run-argv.test.ts` | `--task --no-verify` stays task text with no `removedFlag`; `plugins run … -- --no-verify` hands it to the plugin with no `removedFlag`; `task run --json --task -h` runs in the scratch project. |
| `REQ-cli-505` | `tests/cli.project-path.test.ts` | `--project P task run --task "touch widget" --json` from A: `done`, `verifySkipped` (nothing changed in P), P's `widget` briefing; the fixtures no longer set the removed key. |
| `REQ-cli-007` | `tests/agent.cli.test.ts` (signals, REQ-cli-244 unchanged) | The SIGINT / SIGTERM / ignored-SIGINT / escaped-pipe cases run `task run --task demo` in a carried talk worktree, so the demo run (no files) still starts the fake lane; all pass. |
| `REQ-discord-085` | `tests/work.pr.test.ts`, `tests/worktree.test.ts` | `openWorkPr` finds the base and merge-base through the shared `resolveBase`; worktree creation unchanged apart from the marker. |
| `REQ-discord-001` | `tests/discord.router.test.ts`, `tests/spawn.argv.test.ts` | A mention in an allowlisted channel still starts a session stub; the spawn argv it runs is `task run … --output ndjson` with no `--no-verify` (unchanged, still green). |
| `REQ-discord-014` | `tests/spawn.argv.test.ts`, `tests/agent.ndjson-spawn.test.ts` | Discord spawn argv (fake bin) has no `--no-verify`; a run whose real diff is empty ends with the "no changes" note (`tests/agent.loop.test.ts`). |
| `REQ-discord-073` | `tests/agent.ndjson-spawn.test.ts` | The Discord ndjson spawn fixture's recorded argv has no `--no-verify` and ends `--output ndjson`. |
| `REQ-discord-085` | `tests/agent.verify-gate.test.ts` | A talk worktree made by `ensureTalkWorkspace` holds the marker (`talkWorktreeGitDir`), its first no-change run has nothing to verify, and a blocked run's edit is verified by the next run (fails on the base: no marker, resume skips). |
| `REQ-watch-006` | `tests/spawn.argv.test.ts` | The WATCH-style `.ts` argv is bun-prefixed and has no `--no-verify` (unchanged, still green). |
| `REQ-watch-073` | `tests/agent.ndjson-spawn.test.ts` | The WATCH ndjson spawn fixture's recorded argv has no `--no-verify` and ends `--output ndjson`. |
| `REQ-watch-085` | `tests/agent.loop.test.ts`, `tests/agent.verify-gate.test.ts` | WATCH runs reach the same `runTask` gate: a real edit is verified, a claimed-only path runs the lane, a run that changed nothing ends with the "no changes" note; no config key turns it off. |
| `REQ-agent-002` | `tests/agent.loop.test.ts` | Verify fail then pass retries with feedback and ends verified; exhausted retries fail; a run that reports a changed file verifies with no option set (a guard that passes on the base too). |
| `REQ-agent-502` | `tests/agent.allowlisted-dangerous.test.ts` | Non-git `fledge-hello` edit verifies and fails; a project whose `fledge.toml` sets `verify_before_complete = false` still verifies and fails (fails on the base: skipped, `done`); the GitHub-only run ends `done` with nothing to verify. |
| `REQ-cli-009` | `tests/agent.cli.test.ts`, `tests/cli.doctor-truth.test.ts` | Help still lists `--tier` and `CORVIDINHO_LLM_MODEL_READ / _TOOL / _CODE` and no `--no-verify`; the per-tier doctor line is unchanged. |
| `REQ-cli-073` | `tests/agent.ndjson-spawn.test.ts` | Real CLI in a scratch project: `task run --task hello --output ndjson` prints only protocol-2 frames ending in `result`, equal to `--json`'s result; `--output=json` works and `--output yaml` / a bare `--output` exit 1. |

## Automated coverage

- `bunx tsc --noEmit` — passed.
- `bun test` — see the change check record.
- `specsync check --require-coverage 100` — passed.
- `hi check` — passed.
- `fledge lanes run verify --non-interactive` — see the change check record.

## Where these lessons go

- `specs/agent/context.md`
- `specs/cli/context.md`
- `specs/discord/context.md`
- `specs/watch/context.md`
