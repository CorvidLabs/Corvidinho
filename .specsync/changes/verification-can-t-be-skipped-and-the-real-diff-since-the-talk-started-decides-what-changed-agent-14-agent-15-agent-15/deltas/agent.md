---
module: agent
change: verification-can-t-be-skipped-and-the-real-diff-since-the-talk-started-decides-what-changed-agent-14-agent-15-agent-15
---

# Delta: agent (verification can't be skipped; the real diff since the talk started decides what changed — AGENT-14, AGENT-15, AGENT-15.a)

## Added

### REQUIREMENT REQ-agent-015

Carried baseline in a talk worktree (AGENT-15.a, captured 2026-09-29 from
Leif's 2026-09-28 interview record, round 12). A linked talk worktree is one
whose own git dir is `<common git dir>/worktrees/talk-*` (as
`ensureTalkWorkspace` makes them, REQ-discord-085), read from its `.git`
file (`talkWorktreeGitDir`, `src/worktree/base.ts`). Its own git dir holds a
verified marker (`corvidinho-verified`, never in the working tree, so never
part of a diff) that SHALL be written when the worktree is made and when a
run in it ends `done` (verified, or nothing to verify), never through a
symlink. `startWorkspaceDiff` SHALL take the marker away as a run starts;
when it was there, the run's baseline is its own start snapshot
(REQ-agent-085). When it was not there (the last run in that worktree ended
`blocked`, `failed` or cancelled, or its process died mid-run) or could not
be removed, the tracker SHALL be `carried`: its baseline is the talk
branch's merge-base with the base branch (`resolveBase`: the remote's default
branch, else `main`; `refs/remotes/origin/<base>`, else `refs/heads/<base>`;
the one helper /work uses too, REQ-discord-088) with no dirt, so every path
changed since the talk started counts, including commits and edits an earlier
attempt left, and `runTask` SHALL emit one `Text` event `Verify gate: the last
run in this talk did not end verified, so every edit since the talk started
is checked (from the talk branch's merge-base).` A merge-base git cannot give
SHALL make the diff unreadable, so verify runs anyway (fail closed,
REQ-agent-085). `runTask` SHALL settle the marker once per run: written when
the run ends `done`, removed (so one written meanwhile does not count) when it
ends any other way. A run in any other checkout (the caller's own checkout, a
main checkout, another linked worktree) SHALL keep the run-start baseline. No
env var, config key, flag, table or NDJSON field is added;
`WorkspaceDiffTracker` gains the optional `carried` and `settle` members.

Acceptance Criteria
- A new talk worktree has the marker; its first run that changes nothing ends `done` with the "no changes" note and no carried note.
- A run in a talk worktree that edits `app.ts` and ends `blocked` on an ask leaves no marker; the next run there, which changes nothing, runs verify once, lists `app.ts` in `filesChanged`, emits the carried note and ends `done` verified; the run after that changes nothing and has nothing to verify.
- After a run that failed verify, a run that changes nothing verifies again and ends `failed`.
- A commit an earlier run made through a shell (clean tree) is carried; so is an edit left by a cancelled run and by a process that took the marker and never settled.
- A talk whose base branch cannot be found verifies anyway with the "could not read the git working-tree diff" note.
- The caller's own checkout: an edit left by a blocked run is not carried into the next run.
- `talkWorktreeGitDir` is null for a main checkout and for a linked worktree not named `talk-*`; `takeTalkVerified` is true once, then false, and false for a symlink in the marker's place; a `done` settle never writes through that symlink; a marker planted during a run that does not end `done` is removed.
- The real CLI in a carried talk worktree runs the verify lane although the demo run changes nothing.

## Modified

### REQUIREMENT REQ-agent-002

When the run changed files (in the run's real git working-tree diff per REQ-agent-085, or, with no git snapshot, reported by a tool) or a tool claimed a change git does not show, completion SHALL run `fledge lanes run verify --non-interactive`; there is no switch that skips it (AGENT-14, REQ-agent-003). Pass → `verified=true`. Fail with retries remaining → re-enter executing with verifier output. Exhausted retries → terminal failure with `verified=false` (AGENT-4 / AGENT-4.a / FLEDGE-2). The default runner SHALL spawn fledge with the parent's env minus the delegate worker drop list (`DISCORD_*`, `GITHUB_TOKEN`, `GH_TOKEN`, `CORVIDINHO_AUDIT_HMAC_KEY` and every `CORVIDINHO_ACTING_*` key) and the LLM API keys (`CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`), keeping every other inherited key, so tests the agent wrote never see operator secrets (SAFE-6). The verifier output a retry gets SHALL be the failing step's, not the start of the lane log (AGENT-4.a): output within `VERIFY_FEEDBACK_MAX_CHARS` (4000) is passed whole; over it, `verifyFeedbackExcerpt` SHALL drop colour escapes, name the failing step (from fledge's `Lane '<lane>' failed at step N (<name>)` line; a parallel step is `parallel(<tasks>)`) and keep that step's output from its `Running task: <name>` marker (a parallel step's from its `Running parallel:` line) when it fits, else its error / fail lines (lines that report a failure, such as `error:`, `Expected:`, `(fail)` or `file(1,2): error TS…`, before lines that only mention one; first ones first; passing-test lines left out; printed in log order) and the end of the log, in at most 4000 chars and never cut inside a surrogate pair. `runTask` SHALL keep the feedback it passes as `ExecuteContext.verifyFeedback` (its "Verification failed" head included) within that cap, and the LLM execute (tool loop and read-tier chat) SHALL cap verify feedback with the same excerpt, never by keeping its first 4000 chars. No flag, environment variable or config key is added.

Acceptance Criteria
- Mock verify fail then pass within max_retries yields `verified=true` and a second execute call that receives feedback.
- Exhausted retries yield `verified=false` and failed state.
- Default runner invokes fledge with `lanes run verify --non-interactive`.
- An attempt whose execute result reports no files but that changed the git working tree (REQ-agent-085) runs verify: done with `verified=true` only on a pass, otherwise retried and then failed.
- A process with `DISCORD_TOKEN`, `DISCORD_BOT_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `CORVIDINHO_LLM_API_KEY`, `CORVIDINHO_AUDIT_HMAC_KEY` and `CORVIDINHO_ACTING_*` set runs the default runner: the fledge child's env has none of those keys or values and keeps the rest (PATH, HOME, `CORVIDINHO_DATA_DIR`, other keys).
- A failing lane log whose passing steps (lint, a `--help` smoke over 4000 chars) come before a failing `test` step gives the retry's `verifyFeedback` and the tool loop's next request at most 4000 chars that name `Failing step: test (step 3 of lane 'verify')` and carry the failing test's error lines and fledge's failure line, not the `--help` text (AGENT-4.a).
- A failing step whose own output is over the cap keeps its first error lines and the end of the log (the last failure, the test summary, fledge's failure line); passing-test lines are not kept as error lines.
- A raw verify feedback over the cap passed to the read-tier chat is cut to the failing step and the end of the log, not its first 4000 chars.
- Verify output within the cap reaches the retry and the model whole, as before.
- The excerpt is never longer than its cap and never holds half a surrogate pair.
- Console chatter in the failing step that only mentions a failure (`… marked failed`, `error_class=ok`, as Corvidinho's own tests log on stdout before bun's stderr report) does not crowd out that step's `error:`, `Expected:` / `Received:` and `(fail)` lines.
- Colour escapes (FORCE_COLOR reaching the lane) are dropped from an over-cap log and hide neither fledge's markers nor passing-test lines; a failing parallel step is named `parallel(<tasks>)` and kept from its `Running parallel:` line; a log with no fledge markers is not called a failing step's output.
- An `error:` line with emoji that the end of the error-line scan (where the kept end of the log starts) cuts between a high and a low surrogate is not kept on its high half: with the noise after it swept so the cut falls inside the emoji, the excerpt at 4000 and at runTask's 3946 cap still names the failing step and holds no lone surrogate.
- A run that changed files is verified with no option set; `RunTaskOptions` has no field that skips the gate.

### REQUIREMENT REQ-agent-003

Verification can't be skipped (AGENT-14). `runTask` SHALL have no option and
read no config that turns the verify gate off: `RunTaskOptions` and
`AgentConfig` have no `verifyBeforeComplete`, and a `[corvidinho]
verify_before_complete` key in the project's `fledge.toml` SHALL be ignored
(`loadAgentConfig` reads only `max_retries`; `removedVerifyKeys(cwd)` names a
removed key still set, for doctor, REQ-cli-085). Chat, WATCH, scheduled,
`/work` and delegate runs all reach this one gate through `task run`. The
only run that ends without the lane is one that changed nothing: no path in
its real diff, no tool claim git does not show, a readable diff and no
failed verify earlier in the run (or, with no git snapshot, no reported file
and no tool whose edits no result reports, REQ-agent-502); it SHALL end
`done` with `verifySkipped=true` and exactly one `Text` event `Verify gate:
no changes, nothing to verify.` (`NOTHING_TO_VERIFY_NOTE`), so
`verifySkipped` only ever means that nothing changed. Cancellation via
AbortSignal SHALL abort promptly (AGENT-3).

Acceptance Criteria
- A run that reports a changed file runs verify with no option given; a failing lane ends `failed`.
- A run that changed nothing never calls the verify runner, ends `done` with `verified=false`, `verifySkipped=true`, and emits the "no changes, nothing to verify" note once.
- A project `fledge.toml` with `verify_before_complete = false` does not skip the lane: a real edit (git) and a Fledge command's unreported edit (non-git) are both verified and fail on a failing lane; `parseCorvidinhoSection` returns only `maxRetries`.
- Aborted signal during/before verify returns `cancelled=true`.

### REQUIREMENT REQ-agent-085

Real-diff verify gate (AGENT-4, AGENT-15, issue #85). `runTask` SHALL always
snapshot the run's git project before the first attempt (there is no switch
that skips it, REQ-agent-003): `HEAD`, `git status --porcelain=v1 -z
--untracked-files=all --no-renames` and a fingerprint of every dirty or
untracked path (SHA-256 of the file up to 4 MiB while a 64 MiB content budget
lasts, stat identity past either, link target for a symlink, never followed).
In a talk worktree whose last run did not end verified the baseline is the
talk branch's merge-base instead (REQ-agent-015). Later diffs SHALL
fingerprint again only the paths dirty at the start (with the same kind); a
path that became dirty or untracked is a change by itself. The project root
is the nearest directory at or above the run cwd that holds `.git` (as in
REQ-agent-084); a cwd below the root SHALL read only its own subtree and
report paths relative to the cwd. After each attempt that ends without an
ask, a provider error or an abort, and before deciding whether to verify, the
real diff SHALL decide what changed (AGENT-15): `filesChanged` SHALL hold
only paths that differ from the baseline (paths changed between the baseline
`HEAD` and the current `HEAD`, including a first commit on an unborn `HEAD`;
paths that became dirty or untracked; paths already dirty whose status or
fingerprint changed; dirty paths that became clean), as a union across
attempts (REQ-agent-242). A path a tool reports changing that git does not
show (gitignored, inside a nested repo, a write that changed nothing, a path
outside the cwd) SHALL NOT be listed in `filesChanged`, but SHALL still run
the verify lane (fail closed), with one `Text` event per attempt that names
up to five such new paths (`Verify gate: N path(s) a tool reported changing
are not in the git diff (…), so they are not listed as changed, but verifying
anyway.`). An edit no tool reported (code-tier `shell-exec`, a delegate
worker, a commit made through a shell) SHALL run the verify lane and the run
ends `done` only when it passes, or fails plainly. Paths dirty before the run
and left untouched, and gitignored paths no tool claims, SHALL NOT count.
When the cwd is not inside a git work tree, or the start snapshot cannot be
read, the gate SHALL use tool-reported files (the behaviour before this
requirement), except that a run that called a tool whose file edits no result
reports SHALL verify anyway (REQ-agent-502). When the start snapshot was read
but a later diff cannot be, the gate SHALL fail closed: verify runs, one
`Text` event says the diff could not be read, and `filesChanged` keeps the
real-diff paths read so far (claims are not added). When the real diff has
paths no tool reported, one `Text` event SHALL say how many and name up to
five. At most `WORKSPACE_DIFF_MAX_FILES` (1000) real-diff paths per run SHALL
join `filesChanged` (the note then also says how many of all the changed
paths were listed), so the NDJSON `result` line stays under the parser's line
cap and a bridge still gets the summary; the gate is unaffected because
`filesChanged` is non-empty either way. An empty real diff with no ghost
claim SHALL end `done` with `verifySkipped=true` and the "no changes" note
(REQ-agent-003). The demo execute (no LLM key) changes nothing and SHALL
report no files. Git SHALL run read-only through `runGit` (argv, no shell,
hooks off, repo-locating env stripped, discovery clamped to the root,
optional locks off) with fsmonitor off, and fingerprints are hashed in
process: nothing is written to the index or object store (the talk marker of
REQ-agent-015 lives in the worktree's own git dir, outside both). No flag,
environment variable, config key or slash command is added. `RunTaskOptions`
has a `workspaceDiff` test seam (like `verifyRunner`), not a product surface.

Acceptance Criteria
- In a temp git repo, an attempt that rewrites a tracked file outside the file tools and reports `filesChanged: []` runs verify; a failing lane ends `failed` (`verified=false`, `verifySkipped=false`, `filesChanged` names the file, no `done` state) and a passing lane ends `done` with `verified=true`.
- A new untracked file, a deleted tracked file, a same-size edit to a file already ` M` before the run, a commit made through a shell (clean tree, `HEAD` moved) and a first commit on an unborn `HEAD` each run verify and appear in `filesChanged`.
- A retry after a failed verify that edits only through a shell is verified again and gets the failure output as feedback (AGENT-4.a).
- A run whose cwd is a subdirectory of the repo counts an edit inside the cwd (reported relative to the cwd) and not one outside it.
- Dirt present before the run and left untouched, a change only under a gitignored path no tool claims, and a non-git cwd each skip verify (`verifySkipped=true`) when no tool reported files.
- A non-git cwd whose run called no Fledge command, shell or runner (e.g. only an allowlisted `github-pr-review`) still skips verify; one that called an allowlisted Fledge command runs verify (REQ-agent-502).
- A tracker whose diff cannot be read makes verify run and emits the "could not read the git working-tree diff" `Text` event.
- A tracker whose diff lists a claimed `package.json` and 30000 more paths adds 1000 paths to `filesChanged` (`package.json` first), the note counts the 30000 unreported paths and says 1000 of the 30001 were listed, and the NDJSON `result` line read in 64 KiB chunks still parses with the "Verification failed" summary.
- With the content budget spent, an already-dirty file left alone is not reported and an edit to it is (stat compare).
- The snapshot is always taken (the `workspaceDiff` seam is called once per run) and a real change is verified.
- A tool that claims `dist/out.js` (gitignored, written), `app.ts` (edited) and `ghost.ts` (never written) in a git repo: `filesChanged` is `["app.ts"]`, the lane runs, and one note names `dist/out.js, ghost.ts`; a run whose only change is such a claim still runs the lane, and its retry after the failed verify runs it again.
- The demo execute reports `filesChanged: []`.
- End to end: the tool loop runs the real code-tier `shell-exec` with `printf broken > app.ts` in a temp git repo; its payload has no `filesChanged`, yet `runTask` runs verify once and ends `failed` with `filesChanged: ["app.ts"]`.

### REQUIREMENT REQ-agent-242

`runTask` SHALL treat the files changed by a run as the union of every
attempt's `filesChanged`, so once a verify has failed each later attempt is
verified again, even when that attempt changed no files and even when the
failure came from a tool claim git does not show (REQ-agent-085); the run
SHALL end `done` only after a passing verify, else `failed` when retries run
out (AGENT-4 / AGENT-4.a). `createTaskExecute` SHALL set
`ExecuteResult.error` when the provider call fails (request error, non-2xx
HTTP status, a reply that is not JSON or has no assistant message), and
`runTask` SHALL end such an attempt `failed` with `verified=false` and the
provider error as the summary, whether or not the run changed files, never
`done` (AGENT-4 / AGENT-8). When a verify already failed earlier in the run,
that summary SHALL go on to say plainly `Verification failed on an earlier
attempt and was not re-run:` followed by the last verify output, so the
provider error never hides failing files (AGENT-4); a provider error before
any verify ran adds no such note.

Acceptance Criteria
- A failed verify followed by retries that change no files runs verify on every attempt and ends `failed` (`task run` exits non-zero), never `done`.
- `TaskResult.filesChanged` is the union across attempts.
- Tool-loop and read-tier provider failures (HTTP 401 / 503, network error) set `error: true`; a normal reply leaves it unset.
- An `execute` error on the first attempt, on a retry, or in a run that changed no files ends `failed` without running verify on that attempt.
- An `execute` error after a failed verify keeps the provider error first and then the earlier verify output in the summary; one before any verify does not mention verification.

### REQUIREMENT REQ-agent-502

Non-git verify gate after unreported edits (AGENT-4). A tool whose file edits
no tool result reports (`editsFilesUnreported`: a Fledge command, whose
`origin` starts with `fledge:`, and every `SAFE3_PENDING_TOOLS` name: the
shell, the runners and the Fledge core runs) that the tool loop dispatched
from the offered catalog SHALL be named in the attempt's
`ExecuteResult.unreportedEditTools` (absent when none ran).
A `delegate` call that started a worker (its result carries data) SHALL be
named too when the run has no role session and its allowlist names a Fledge
plugin command (a `fledge-*` name other than the four Fledge core builtins):
the worker gets that allowlist, so it may have run the Fledge command and its
edits reach the lead's result as no file (a role-session worker is non-ADMIN
and offered none).
A `delegate` call whose worker ran but left no result frame (its data has no
`verified`, which every result frame carries: the worker was stopped at its
timeout or by an abort, crashed, or could not start) SHALL be named whatever
the allowlist: whatever that worker edited reached the lead's result nowhere.
`runTask` SHALL union these names across attempts and, when no git snapshot
is available (the cwd is not in a git work tree, or the start snapshot could
not be read), no file was reported and a name was recorded, SHALL run the
verify lane anyway (fail closed) and emit one `Text` event per such attempt
starting `Verify gate: no git working tree to diff` that names the tools; the
run then ends `done` only when verify passes, and otherwise retries and fails
plainly. A run in a git work tree keeps the real diff (REQ-agent-085); a
non-git run that called only tools that report their files or change no
project files (GitHub, memory, Discord) still ends with nothing to verify
(REQ-agent-003). A project `fledge.toml` cannot turn this off (AGENT-14). No
env var, config key, flag, slash command or schema is added.

Acceptance Criteria
- Non-git project, allowlisted `fledge-hello` that writes `app.ts` and reports no files: verify runs once in the project dir, the run ends `failed` with `verified=false` and `filesChanged: []`, and the `Text` note names `fledge-hello`.
- The same with `includeDangerous` (every dangerous tool offered) also runs verify and fails.
- Non-git project whose only tool call was an allowlisted `github-pr-review` (dry run, success): verify is skipped and the run ends `done`.
- The same Fledge run in a project whose `fledge.toml` sets `verify_before_complete = false` still runs verify once and ends `failed` (AGENT-14).
- The execute result of an attempt that ran `fledge-hello` has `unreportedEditTools: ["fledge-hello"]`.
- Non-git project with autonomous mode on, allowlist `["fledge-hello"]`: a `delegate` call whose worker failed its own verify and reported no files makes the lead run verify, end `failed` (never `done`), and the note names `delegate`; with an allowlist naming no Fledge plugin command the same run skips verify and ends `done`.
- `editsFilesUnreported` names `fledge-lanes-run` and `fledge-run`.
- Non-git project with autonomous mode on and an empty allowlist: a `delegate` call whose worker writes `app.ts` and exits 137 before writing any result frame makes the lead run verify once in the project dir and end `failed` (`verified=false`, `verifySkipped=false`, never `done`), and the note names `delegate`.
