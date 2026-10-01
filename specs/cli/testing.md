---
spec: cli.spec.md
---

## Automated Tests

- `tests/cli.smoke.test.ts` — `--help` exits 0; `version` exits 0 with semver.
- `tests/cli.project-path.test.ts` (REQ-cli-505, CLI-5) — `parseGlobalFlags` takes `--project <path>` / `--project=<path>` before `--` only, never from `--task` text, `""` without a path; `readStartEnv` parses a NUL-separated environ block; `envFileFlags` keeps only Bun's `.env` flags, in order; `enterProject` on an unusable path leaves the cwd alone. CLI spawns started in temp dir A against temp project P: `task run --task "touch widget" --json` with `--project` before or after the command uses P's `fledge.toml` (verify off; A's keeps it on) and P's `widget` spec; `--project P doctor` prints exactly what `doctor` started in P prints (P's `.env.local` over `.env`, `$VAR` expanded, A's `.env` LLM key gone, never printed); `--project P specsync check` gives a fake `specsync` child P's `.env` values and none of A's, exactly as started in P; `bun --no-env-file` CLI `--project P doctor` prints what the same started in P prints (no P `.env`); a set env var wins over P's `.env`; a missing path, a file and an empty `--project` are one error line + hint, exit 1, nothing run (`--json`: `{ok:false,error}`).
- `tests/runners.plugins.test.ts` — `plugins list` (CLI spawn) with no toolchain on PATH exits 0 and prints `Language runners (PLUGIN-4): none loaded` and a `not loaded` line per runner; with only `cargo` on PATH it lists `cargo-exec` and its binary (REQ-cli-112 / REQ-plugins-314).
- `tests/daemon.restart-recovery.test.ts` — daemon stop after the grace removes an abandoned schedule run's worktree and empty `talk/schedule_*` branch before it resolves, and keeps a branch with commits; a start after `kill -9` of a daemon mid-run fails that run (`interrupted: process restarted`), removes its worktree and branch and logs `daemon.recovered`; a start removes a leftover worktree of a run already recorded failed and leaves other worktrees alone; a start (even with that worktree as its project root) never touches a schedule-run worktree whose run another data dir owns, keeping its uncommitted files and branch (REQ-cli-108 / REQ-discord-346).
- `tests/scheduler.ask-outbox.test.ts` — `startDaemon` on a temp data dir logs `run.needs_human` (`reason` `stuck`) for a stuck schedule run and leaves its ask pending on the run row; a Discord bridge started later on the same data dir posts it to the owner once (REQ-cli-098 / REQ-discord-347).
- `tests/cli.doctor-truth.test.ts` (REQ-cli-430, CLI-4) — doctor and `init` run in fixture project dirs: an empty dir gets one `[missing]` line each for `fledge.toml`, `verify-lane`, `.specsync` and `specs` (plain-language reason and creator command), exit 1, nothing created; a complete project and this checkout get `[ok]` for each; `init` also prints the `llm` / `fledge` / `specsync` lines and no Discord line; verify-lane variants (task, `{ task }`, `{ run }` bare / by path / quoted, parallel, `deps`, `.fledge/lanes/` import, no spec-check, no lane, undefined `spec-check` task, an undefined step task or dep named in the line); a non-TOML `fledge.toml` is named, never printed; a FIFO `fledge.toml` is never opened; from a subdirectory of a git project the lines name the project root instead of `fledge run --init` / `specsync init`.
- `tests/cli.doctor-truth.test.ts` (REQ-cli-003, CLI-4) — a whitespace-only `GITHUB_TOKEN` and `GH_TOKEN` print `[missing] github: missing GITHUB_TOKEN or GH_TOKEN for Octokit plugins` (no `[ok] github:`) beside `[missing] github-watch`, exit 1; a blank `GITHUB_TOKEN` beside a real `GH_TOKEN` prints `[ok] github` without the value.
- `tests/daemon.test.ts` (REQ-cli-108, DISCORD-SCHEDULE-3) — after start, a channel removed from the allowlist file or a creator added to its `deny_users` is refused on the next tick without running the agent; a malformed file makes the tick log `tick.allowlist_failed` and run nothing, and the still-due schedule runs once the file is fixed; with a non-empty user list the configured owner's schedule still runs and an unlisted non-owner's is refused; a tick still re-reading the allowlist when stop begins claims no run. The fixture env blanks the operator's Discord user/role/deny lists and owner.
- `tests/ops.backup.test.ts` (REQ-cli-680, OPS-1/2) — config: unset/blank off, relative invalid, absolute resolved. Snapshot: consistent while another connection holds an uncommitted write (committed rows only), UTC name, 0600 file in a created 0700 dir, no temp left, `checkDbFile` ok; rows stored before a scrub-rules bump are redacted in the snapshot (the key's bytes absent); nine nights keep the newest 7, unrelated files stay; a dir in a git work tree and a file path are refused with nothing written. Restore: new target 0600 with the rows; a target this process holds open refused even with force (live DB unchanged); a live `daemon.lock` beside `corvidinho.db` counts as a holder; an idle existing target needs force and its stale `-journal` is removed; traversal / missing / corrupt names and a directory target refused. Restore test: newest snapshot restored, counts match, temp root emptied; corrupt newest, counts that differ and no snapshot fail. Ticker: unset does nothing; once per night from 03:00 local across two connections, restore test on night 1 and again 7 days later; a failing backup is logged and told once per streak with fixed text (no path, no error), again after a success and a new failure; a daemon ticker leaves the notice pending, a failing post hands it back (`owner_not_told` once), a later post delivers it; a failing restore test is retried nightly and told once; the night claim is per local day; a running mark of this (live) process is left alone, one whose process is gone is recorded once as a `restore_test.failed` (`interrupted: true`, told once) and tonight's run then clears its own mark and ends the streak; a notice whose post outlasts `settle(20)` is handed back, a stopped ticker takes nothing more, and a post that then goes out takes it again. Snapshot also: a symlink into a git work tree (and a dir not created yet below it) is refused with nothing written; a snapshot temp file more than an hour old is removed, a recent one and other files stay. Doctor: `[warn]` off / relative / in-repo, `[warn]` while no `/announce` channel is set, `[ok]` fresh and after a good night once one is, `[warn]` failing with the reason and `owner not told yet` / `owner told`; with no data dir DB yet it reads no history and creates nothing.
- `tests/ops.backup-wiring.test.ts` (REQ-cli-680 / REQ-discord-680) — does not import `src/store/backup.ts`, so each test fails on its own assertion on the base: `SchedulerService.tick` hands its clock to `backup`; `startDaemon` logs `daemon.started` with `backup` (dir / `off`), its tick writes one snapshot and logs `backup.ok` + `restore_test.ok`, a file as dir logs `backup.failed` (error, `ownerNotice: recorded`) and leaves `ops_backup_notice`; the bridge (null gateway, `schedulerNow` 03:30) posts one owner-pinged fixed-text notice to the announce channel over many ticks and none without a channel (notice stays pending), and writes tonight's snapshot for a good dir without a ping; a bridge stopped while the notice's post hangs leaves the notice pending; a daemon whose allowlist file stops loading logs `tick.allowlist_failed` and still writes tonight's snapshot; CLI spawns: `--help` lists `backup list` / `backup restore`, `backup list` prints a snapshot, `backup restore` restores it, restoring onto the DB the test process holds exits 1 (`is open in process <pid>`), unset dir exits 1, `doctor` prints `[warn] backup: off …`, `[warn] backup: <dir> — 1 snapshot(s)` with `no /announce channel set` and, once one is set, `[ok] backup: <dir> — 1 snapshot(s)`.
- `tests/docs.operator-facts.test.ts` (REQ-cli-005 / REQ-cli-108) — `--help` (CLI spawn) says an empty Discord channel list refuses start and users/roles both empty admit anyone in an allowlisted channel, once either is set only those users, role holders and the owner, and no row naming `_USERS` / `_ROLES` says empty = refuse or deny-all; the `docs/DAEMON.md` Logs table has a row for every event `src/daemon/daemon.ts` logs (known prefixes plus any event passed to `log()` / `fail()`), `daemon.start_failed` (start refused, exit 1, `message`) and `spend.warning` (warn, amounts, percent) included; the `docs/DAEMON.md` Configuration allowlist row says an empty channel list refuses every schedule that has a channel and users and roles both empty leave only the channel gate and the deny lists (checked against `gateActor`, REQ-discord-020), never "Empty means deny-all".
- `tests/preload.tmp-cleanup.test.ts` (REQ-cli-711) — child `bun test ./tests/fixtures/preload-tmp-probe.ts` with `TMPDIR` set to a fresh dir: `tmpdir()` (in a test and at module top level), `TMPDIR`, `TMP` and `TEMP` are one `corvidinho-test-run-*` dir directly inside it, and the data dir, the probe's `mkdtemp` dirs and a shell `mktemp -d` spawned without `env` are inside that root; shortly after the child exits the fresh dir is empty when the probe passes (exit 0), fails (exit 1, failure printed; also with `--bail`), calls `process.exit(7)` (exit 7) and when the child's bun process is SIGKILLed mid-test (exit 137); `--rerun-each=2` passes both runs and leaves it empty; another run's `corvidinho-test-run-*` root there and the target of a symlink the probe left in its root are untouched. Fails on main's preload (all 7) and on a preload `afterAll` removal (`--bail`, SIGKILL, `--rerun-each` ENOENT).

## Fixtures

- None; smoke spawns `bun src/cli.ts` against the repo root.

## Manual QA

- Run `bun src/cli.ts doctor` with and without Discord token env; confirm secret values never appear in output.
- Run `fledge lanes run verify --non-interactive` after CLI changes.

## SAFE-13 notice on the task-run result (REQ-cli-071)

`tests/safe.injection.test.ts` — `createTaskExecute({ onInjection })` reports
the tool and reason ids once, which `task run` copies to
`TaskResult.injection`; the Discord and WATCH spawn clients read it back with
`injectionNoticeFromUnknown` (tool-name source, known reasons only), and the
bridge / WATCH tests drive the owner notice from it.

## Private replies on the task-run result (REQ-cli-710)

`tests/memory.private-view.test.ts` — the Discord agent client spawns the
real `task run --output ndjson` against a local fake LLM that calls
`memory-profile` and `memory-recall --category private`; the result frame's
`privateReplies` holds both texts, the summary and every model request lack
them. Spawned directly with seven private reads of different notes, its own
result frame (read off stdout) carries the first five, the last saying 2 more
were not sent.
## No verify skip (REQ-cli-085, REQ-cli-006, REQ-cli-007)

- `tests/agent.cli.test.ts`: help has no `--no-verify`; `task run --no-verify`
  and `--no-verify doctor` exit 1 with the one refusal line and hint, print
  nothing on stdout and never start the fake `fledge`; with `--json` /
  `--output json` stdout is exactly `{ ok: false, error }`; `task run --json`
  in a scratch project ends `done` with `filesChanged: []` and one "no
  changes, nothing to verify" event; the SIGINT / SIGTERM cases run in a
  carried talk worktree so the lane still starts.
- `tests/cli.task-argv.test.ts`, `tests/cli.plugins-run-argv.test.ts`:
  `--task --no-verify` and a `plugins run` argument after `--` never set
  `removedFlag`.
- `tests/cli.doctor-truth.test.ts`: a `fledge.toml` with
  `[corvidinho] verify_before_complete = false` prints `[warn] verify-gate`
  and doctor still passes; without the key there is no such line.
- `tests/agent.verify-gate.test.ts`: the real CLI in a project whose
  `fledge.toml` sets the key false runs the lane and exits 1.
- `tests/agent.ndjson-spawn.test.ts`, `tests/agent.ask.test.ts`,
  `tests/agent.spend-ask.test.ts`, `tests/cli.project-path.test.ts`: the real
  CLI runs in scratch projects without `--no-verify`, never the repo's own
  snapshot or verify lane.
## GitHub logins without a numeric id (REQ-cli-367, IDENTITY-7.a)

`tests/cli.doctor-truth.test.ts` › "doctor warns about GitHub logins with no
numeric id" — the real CLI with a clean env and a temp allowlist file: an
`[owner]` with `github_login` but no `github_id` and a person with only
`github_logins` give one `[warn] people-github: ada, the owner: …` line naming
person ids only (no Discord id, GitHub id or login printed) and doctor still
passes; with `[owner] github_id` and `github_ids` there is no such line. Both
fail on the base sources (no line) and pass after.

## The test preload clears a scheduled run's session id (REQ-cli-262 modified, DISCORD-SCHEDULE-3.a)

`tests/preload.operator-data-dir.test.ts` › "bot run settings … a scheduled
run's session id do not reach the suite" — a child `bun test` of
`tests/fixtures/preload-probe.ts` started with
`CORVIDINHO_DISCORD_SESSION_ID=schedule_…` (as a scheduled run's verify lane
inherits it) sees no such key. Without the preload line the probe reports it,
and the full suite run under that key fails 13 ROLES-CHAT-8 / team gate tests.

## Must-ask notes on the event stream (REQ-cli-097)

`tests/must-ask.gate.test.ts` — the notifier receives the `AUTONOMY-9:
waiting for the owner's OK on an Approve card with the one-time code` line
and the approval line; a lapse's refusal says the running bridge DMs the card
and that with no bridge it lapses. `tests/must-ask.boundary.test.ts` — with
no notifier set the wait line goes to stderr.

## No provider: task run, daemon, doctor / init (REQ-cli-079, REQ-cli-003, REQ-cli-007, REQ-cli-098, REQ-cli-262; AGENT-10 / AGENT-13)

`tests/agent.providers.test.ts` — `task run` with only a key exits 1 with the
notice as its first stderr line and as the failed result (`--json` too); the
daemon logs `llm: "none"` on `daemon.started` and a warn `llm.no_provider`
(and neither with a model); `llmDoctorCheck` for ollama / anthropic / a
partly configured env; an unset model is not unpriced under a cap.
`tests/cli.doctor-truth.test.ts` — exact `[warn] llm` lines (model without its
key, key without a model), `[ok] llm … @ api.openai.com`, `init` in an empty
dir. `tests/preload.operator-data-dir.test.ts` — the operator's model config
and provider keys never reach the suite. `tests/cli.plugins-run-argv.test.ts`,
`tests/cli.project-path.test.ts`, `tests/agent.cli.test.ts` run `task run`
against the localhost fake provider. `tests/docs.operator-facts.test.ts`
checks the `llm.no_provider` Logs row.
`tests/daemon.no-provider-run.test.ts` — a daemon with no model whose two due
schedules spawn the real `task run` (a wrapper bin that clears the model
settings): the owner's schedule's run row keeps the notice as `summary`,
another creator's `That didn't work.`, both with `error` `failed (exit 1):
<notice>`; each `run.finished` is a `warn` with `ok: false` and that `error`,
and `[scheduler] run failed (schedule <id>, exit 1): <notice>` is logged for
each (DISCORD-3.b since #340; the REQ-cli-079 text now says so).
- Fail on base: the notice, daemon, doctor, init, preload and `--task -h`
  cases fail with the base's sources (and the base preload). The daemon
  schedule-run case documents #340's behaviour and passes on main (the
  REQ text was stale, not the code).

## Model fallback in task run and the daemon (REQ-cli-080; AGENT-11)

`tests/agent.fallback.test.ts` ("NDJSON: …", "daemon: …"): the real
`task run --output ndjson` against a localhost provider whose head answers
404 streams the `[operator] … falling back to …` Text frame, usage frames
with `model` / `byModel`, and a `done` result with the note, `model`,
`usageByModel` and `modelFallback`; text mode with a 410 head prints the line
on stderr and the note after the answer. A daemon with its own spawn client
(`CORVIDINHO_BIN` a fake bin whose result frame reports a failover) logs an
`llm.fallback` warn event with `sessionId`, `fallbacks` and `message` for a
due schedule. `tests/docs.operator-facts.test.ts` keeps the Logs table whole.
- Fail on base: all of these fail with the base's sources.

## The daemon reads the owner live for each schedule run (REQ-cli-741; DISCORD-SCHEDULE-1.a)

`tests/scheduler.owner-role.test.ts` ("daemon: …") — `startDaemon` with an
allowlist file naming the owner spawns the owner's due schedule with
`actingIsAdmin: true`; after the file names another owner, the next due run
of the same schedule is spawned `actingIsAdmin: false`, with no restart.
- Fail on base: with the base's (af4597e) `src/daemon/daemon.ts` and
  `src/scheduler/service.ts` swapped in, it fails (always `false`); it passes
  on the branch.
## Doctor per spend cap and the preload (REQ-cli-098 modified, REQ-cli-262 modified; SAFE-14 / SAFE-15)

- `tests/agent.spend-caps.test.ts` › "`corvidinho doctor` prints a line per
  provider cap" — with an Anthropic model and
  `CORVIDINHO_PROVIDER_SPEND_CAPS_USD=api.anthropic.com=2` the real CLI prints
  `[info] spend: no total daily cap set (CORVIDINHO_DAILY_SPEND_CAP_USD)` and
  `[ok] spend provider:api.anthropic.com: $0.00 of $2.00 daily cap for
  api.anthropic.com used in the last 24h (0%; 0 provider call(s);
  CORVIDINHO_PROVIDER_SPEND_CAPS_USD, SAFE-14)`, never the key; the unit
  tests cover `warn` at 80% and at the cap and the invalid setting (named,
  not echoed).
- `tests/preload.operator-data-dir.test.ts` › "bot run settings … do not
  reach the suite" — a child `bun test` started with
  `CORVIDINHO_PROVIDER_SPEND_CAPS_USD` set sees no such key
  (`tests/fixtures/preload-probe.ts` lists it). Fail on base: the base
  preload leaves it set and the probe reports it.


## A task run in a git repo works in its own worktree; --here runs it in the checkout (REQ-cli-122; SESSION-WORKTREE-1.a)

`tests/cli.task-worktree.test.ts` — temp repos under the test run's temp root
(never this checkout), a localhost fake model and a fake `fledge`; every
test removes the worktrees and branches it made.
- `parseTaskHere`: `--here` only among `task run`'s own args before `--`,
  never `--task --here`, `--task=--here` or `-- --here`.
- `enterCliTaskWorkspace` / `finishCliTaskWorkspace` in-process: the
  worktree comes from the realpath repo top (a start dir reached through a
  symlink), sits under `<repo parent>/.corvid-worktrees` (or
  `WORKTREE_BASE_DIR`) as `talk-cli_<12 hex>-<16 hex>` on `talk/<same>`, runs
  in the same subdir and has neither the checkout's uncommitted edit nor its
  untracked file; `--here`, a non-git dir and every child env stay in place;
  an untracked start subdir and an unborn HEAD fail closed with nothing left;
  a failing post-checkout hook fails closed and leaves neither the worktree
  nor the branch `git worktree add` made; an aborted signal is `cancelled`; a
  dirty worktree is kept with its branch, a clean one with a commit is
  removed and its branch kept; after the run switched to a branch of its own,
  that branch is the one named and the talk branch goes unless it has commits
  only on it (then it is named too).
- The real CLI: the default run's edit lands in the worktree (not the
  checkout), the first event is the start line and `result.workspace` names
  the kept worktree (`--json`), text mode prints the start and kept lines;
  `--here` edits the checkout and makes nothing; a run that changes nothing
  leaves nothing (`--task --here`, `-- --here`); an old-bridge child
  (`CORVIDINHO_ACTING_IS_ADMIN=0`) makes nothing; an untracked subdir, a file
  as `WORKTREE_BASE_DIR` and an unborn HEAD exit 1 with the `pass --here`
  hint and no model call; a failing post-checkout hook exits 1 with the
  hook's line and leaves no worktree or branch; SIGINT during `git worktree
  add` (a `git` wrapper that pauses there, or a post-checkout hook that waits
  while the whole process group gets it, as Ctrl-C at a terminal does) exits
  130 with nothing left.
- Existing spawned `task run` tests in git repos pass `--here` (they test
  in-place behaviour).
- Fail on base: with the base's (9ea4005) six modified sources swapped in
  (the new `src/worktree/cli-run.ts` kept so imports resolve) the file cannot
  load (`parseTaskHere` is missing); with that import stubbed, 8 of 18 fail —
  every real-CLI worktree case, the flag parse and both spawner argv cases —
  and the 10 that pass are the in-process units of the new module plus the
  `--here` and child cases, which run in place on the base too. The review
  round added seven cases (the failing hook, in-process and real CLI; SIGINT
  to the whole process group mid-checkout; the switched branch named, kept
  dirty, talk branch only, both branches kept): with the first cut of
  `src/worktree/cli-run.ts` (4c20563) swapped in, 6 fail (the
  talk-branch-only case passes there too); restored, 25 of 25 pass.
