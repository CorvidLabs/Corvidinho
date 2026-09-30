---
change: verification-can-t-be-skipped-and-the-real-diff-since-the-talk-started-decides-what-changed-agent-14-agent-15-agent-15
artifact: testing
---

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
