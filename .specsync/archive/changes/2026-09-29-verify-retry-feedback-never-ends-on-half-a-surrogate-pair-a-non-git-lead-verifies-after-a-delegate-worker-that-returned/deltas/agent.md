---
module: agent
change: verify-retry-feedback-never-ends-on-half-a-surrogate-pair-a-non-git-lead-verifies-after-a-delegate-worker-that-returned
---

# Delta: agent (verify retry feedback never ends on half a surrogate pair; a non-git lead verifies after a delegate worker that left no result frame — REQ-agent-002, REQ-agent-502)

## Modified

### REQUIREMENT REQ-agent-002

When `verify_before_complete` is enabled and the run changed files (reported by a tool, or in the run's real git working-tree diff per REQ-agent-085), completion SHALL run `fledge lanes run verify --non-interactive`. Pass → `verified=true`. Fail with retries remaining → re-enter executing with verifier output. Exhausted retries → terminal failure with `verified=false` (AGENT-4 / AGENT-4.a / FLEDGE-2). The default runner SHALL spawn fledge with the parent's env minus the delegate worker drop list (`DISCORD_*`, `GITHUB_TOKEN`, `GH_TOKEN`, `CORVIDINHO_AUDIT_HMAC_KEY` and every `CORVIDINHO_ACTING_*` key) and the LLM API keys (`CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`), keeping every other inherited key, so tests the agent wrote never see operator secrets (SAFE-6). The verifier output a retry gets SHALL be the failing step's, not the start of the lane log (AGENT-4.a): output within `VERIFY_FEEDBACK_MAX_CHARS` (4000) is passed whole; over it, `verifyFeedbackExcerpt` SHALL drop colour escapes, name the failing step (from fledge's `Lane '<lane>' failed at step N (<name>)` line; a parallel step is `parallel(<tasks>)`) and keep that step's output from its `Running task: <name>` marker (a parallel step's from its `Running parallel:` line) when it fits, else its error / fail lines (lines that report a failure, such as `error:`, `Expected:`, `(fail)` or `file(1,2): error TS…`, before lines that only mention one; first ones first; passing-test lines left out; printed in log order) and the end of the log, in at most 4000 chars and never cut inside a surrogate pair. `runTask` SHALL keep the feedback it passes as `ExecuteContext.verifyFeedback` (its "Verification failed" head included) within that cap, and the LLM execute (tool loop and read-tier chat) SHALL cap verify feedback with the same excerpt, never by keeping its first 4000 chars. No flag, environment variable or config key is added.

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
`runTask` SHALL union these names across attempts and, when the verify gate is
on, no git snapshot is available (the cwd is not in a git work tree, or the
start snapshot could not be read), no file was reported and a name was
recorded, SHALL run the verify lane anyway (fail closed) and emit one `Text`
event per such attempt starting `Verify gate: no git working tree to diff`
that names the tools; the run then ends `done` only when verify passes, and
otherwise retries and fails plainly. A run in a git work tree keeps the real
diff (REQ-agent-085); a non-git run that called only tools that report their
files or change no project files (GitHub, memory, Discord) still skips verify;
`--no-verify` is unchanged. No env var, config key, flag, slash command or
schema is added.

Acceptance Criteria
- Non-git project, allowlisted `fledge-hello` that writes `app.ts` and reports no files: verify runs once in the project dir, the run ends `failed` with `verified=false` and `filesChanged: []`, and the `Text` note names `fledge-hello`.
- The same with `includeDangerous` (every dangerous tool offered) also runs verify and fails.
- Non-git project whose only tool call was an allowlisted `github-pr-review` (dry run, success): verify is skipped and the run ends `done`.
- The verify gate off: the Fledge run ends `done` with verify skipped.
- The execute result of an attempt that ran `fledge-hello` has `unreportedEditTools: ["fledge-hello"]`.
- Non-git project with autonomous mode on, allowlist `["fledge-hello"]`: a `delegate` call whose worker failed its own verify and reported no files makes the lead run verify, end `failed` (never `done`), and the note names `delegate`; with an allowlist naming no Fledge plugin command the same run skips verify and ends `done`.
- `editsFilesUnreported` names `fledge-lanes-run` and `fledge-run`.
- Non-git project with autonomous mode on and an empty allowlist: a `delegate` call whose worker writes `app.ts` and exits 137 before writing any result frame makes the lead run verify once in the project dir and end `failed` (`verified=false`, `verifySkipped=false`, never `done`), and the note names `delegate`.
