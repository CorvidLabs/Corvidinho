---
module: agent
change: in-a-specsync-repo-it-opens-and-works-a-specsync-change-for-its-edits-and-on-corvidinho-it-approves-and-archives-its
---

# Delta: agent (it works the repo's SpecSync change, and on Corvidinho approves and archives its own once verify is green — AGENT-18, AGENT-18.a)

## Added

### REQUIREMENT REQ-agent-518

Repo ways and SpecSync coverage (AGENT-18, captured on main from Leif's
2026-09-28 interview: "It works each repo's own way: a SpecSync change where
the repo uses SpecSync; …"; this builds its SpecSync clause). At planning
`runTask` SHALL read the ways the repo works with `scanRepoWays(cwd, base)`
(`src/agent/repo-ways.ts`): the SpecSync change workflow (`.specsync/sdd.json`
with `enabled: true`), hi criteria (a `hi/*.md` whose front matter has a
`hi:` line) and Trust (`.trust.toml`), each flag the union of the session
base (`repoWaysBase`: the merge-base with the remote's default branch, else
HEAD), HEAD and the working tree, so a file deleted or committed away during
the run cannot switch a way off. It SHALL emit one Text line naming the ways
found (`formatRepoWaysLine`; none when nothing is found) and pass `repoWays`
to every attempt (`ExecuteContext.repoWays`, absent when none); the tool loop
SHALL append the fixed `renderRepoWaysBlock` text to its system prompt (open
a change with `specsync-change-new` for the edits, answer it with
`specsync-change-answer`, fill its artifacts, never approve, review or
finalize a change; in a hi repo never invent criteria and cite captured hi
ids). Before the lane, the SpecSync policy — the start scan merged with a
scan now (`mergeScans`: enabled or required in any tree counts, meaningful
paths the union, ignored paths the intersection; an `sdd.json` that is not a
JSON object fails closed as enabled, required, every path meaningful) —
SHALL be checked: when it requires a change for meaningful files
(`require_change_for_meaningful_files`), every path of the run's real diff
(REQ-agent-085; tool-reported paths with no git snapshot) that it counts as
meaningful (`meaningful_paths` less a more specific `ignored_paths` entry;
SpecSync's defaults when a list is missing) SHALL be covered by an open
change's `affected_paths` (`.specsync/changes/*/state.json`: the path, or a
dir prefix) or by a change archived in the same diff. Otherwise, or when the
diff cannot be read, the attempt SHALL be a failed verify with no lane run:
one `SpecSync gate:` Text note naming the paths (five, then "…") and how to
open a change, a `VerifyResult` with `success: false`, the note as the
retry's whole feedback after its "Verification failed" head, and after the
retries the failed result with the stuck ask. No env var, config key, flag,
NDJSON field or schema.

Acceptance Criteria
- `detectRepoWays` finds all three ways in a repo that has them and none in a plain one (a `hi/README.md` without front matter and a disabled `sdd.json` do not count); with `sdd.json`, `hi/` and `.trust.toml` removed from the working tree HEAD still has them, and after a commit that removes them only the base passed in still does.
- A non-git project reads its working tree only.
- Meaningful vs ignored paths follow `sdd.json` (the more specific entry wins; SpecSync's defaults make `.specsync/sdd.json` meaningful and `.specsync/lifecycle/…` not); an unparseable `sdd.json` makes every path meaningful; merged policies keep the strictest reading.
- An open change's file or dir path covers; a change archived before the diff does not, one archived in it does; a policy that does not require changes covers everything.
- In an SDD repo, an attempt that edits `src/app.ts` with no change gets the `SpecSync gate:` note, no lane call and a failed `VerifyResult`; the retry (feedback starts with the note) that opens a change covering it runs the lane once and ends verified; the ways line names SpecSync changes and hi, and `ctx.repoWays` is `{ sdd: true, hi: true, trust: false }`.
- Deleting `sdd.json` and committing mid-run on a branch still gates (failed, no lane call).
- A repo with none of the ways gets no ways line, no `repoWays` and the gate as before.
- The tool loop's system prompt carries the SpecSync and hi block only when `repoWays` has them.
- `tests/agent.repo-ways.test.ts` fails on the base sources and passes after.

### REQUIREMENT REQ-agent-519

Own SpecSync change on Corvidinho (AGENT-18.a, captured in this change with
`hi` from Leif's 2026-09-28 interview, round 13 of 2026-09-30: "On
Corvidinho it may approve and archive its own SpecSync change once verify is
green; in other repos a human approves, reviews and finalizes."). `runTask`
SHALL keep a per-cwd run ledger (`beginSddRun` / `endSddRun`) in which
`specsync-change-new` records the change ids its own spawn added
(REQ-plugins-518), never ids from model text. Right after a lane that passed
with the AGENT-15 evidence verdict, for each recorded change still open, it
SHALL settle it (`settleOwnSddChanges`): when the cwd is not Corvidinho
itself, one Text line SHALL say the change stays open for a human to
approve, review and finalize and nothing is approved; when it is
(`isCorvidinhoProject`: the cwd shares the git common dir of the checkout
this code runs from — the checkout or one of its worktrees — and that
repository's `origin` is github.com/CorvidLabs/Corvidinho, both read from
disk, never an env var, flag or model input), the ledger SHALL be marked
verified only while `runTask` runs `specsync-change-approve <id>` and then
`specsync-change-finalize <id>` through `runPlugin` (non-interactive, the
run's `CORVIDINHO_ALLOWLIST`), so the role gate, SAFE-1, the must-ask gate,
SAFE-5 and the tools' own gate (REQ-plugins-519) all apply, with one Text
line per outcome (approved and archived; not approved, with the scrubbed
reason; approved but not archived). A refused or failed step SHALL leave the
change for a human and the run verified. When a step ran, the lane (with the
evidence verdict) SHALL run again over what it wrote; if it fails the run
SHALL end failed, not verified, with no retry, and its summary SHALL say
verification failed when re-run over what approving and archiving its own
change wrote. A change this run
did not open SHALL never be approved or archived.

Acceptance Criteria
- On Corvidinho (test seam) with both tools allowlisted, a run that opened `bump-x` through `specsync-change-new` and whose lane passes spawns `change approve bump-x --actor corvid-agent`, `change check`, `change review --reviewer corvid-agent` and `change finalize` in that order, emits the approved-and-archived line, runs the lane twice and ends verified with the change archived.
- On a repo whose origin is not Corvidinho the run ends verified, spawns only `change new`, runs the lane once and says the change stays open for a human.
- On Corvidinho without the allowlist the approve is denied by SAFE-1, the line names it and says the change stays open for a human, the run stays verified, and an open change the run did not open is untouched.
- A lane that fails when re-run after the approve and archive ends the run failed and says so.
- A failing approve leaves the change open with a line naming the reason; finalize is not run; the run stays verified with one lane run.

## Modified

### REQUIREMENT REQ-agent-002

When the run changed files (in the run's real git working-tree diff per REQ-agent-085, or, with no git snapshot, reported by a tool) or a tool claimed a change git does not show, completion SHALL run `fledge lanes run verify --non-interactive`; there is no switch that skips it (AGENT-14, REQ-agent-003). Pass → `verified=true` only when the lane's output also shows that tests ran and no test was deleted or turned off since the baseline (AGENT-15, REQ-agent-185); a passing lane without that evidence is a failed verify like any other, whose note leads the retry's feedback. Fail with retries remaining → re-enter executing with verifier output. Exhausted retries → terminal failure with `verified=false` (AGENT-4 / AGENT-4.a / FLEDGE-2). The default runner SHALL spawn fledge with the parent's env minus the delegate worker drop list (`DISCORD_*`, `GITHUB_TOKEN`, `GH_TOKEN`, `CORVIDINHO_AUDIT_HMAC_KEY` and every `CORVIDINHO_ACTING_*` key) and the LLM API keys (`CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`), keeping every other inherited key, so tests the agent wrote never see operator secrets (SAFE-6). The verifier output a retry gets SHALL be the failing step's, not the start of the lane log (AGENT-4.a): output within `VERIFY_FEEDBACK_MAX_CHARS` (4000) is passed whole; over it, `verifyFeedbackExcerpt` SHALL drop colour escapes, name the failing step (from fledge's `Lane '<lane>' failed at step N (<name>)` line; a parallel step is `parallel(<tasks>)`) and keep that step's output from its `Running task: <name>` marker (a parallel step's from its `Running parallel:` line) when it fits, else its error / fail lines (lines that report a failure, such as `error:`, `Expected:`, `(fail)` or `file(1,2): error TS…`, before lines that only mention one; first ones first; passing-test lines left out; printed in log order) and the end of the log, in at most 4000 chars and never cut inside a surrogate pair. `runTask` SHALL keep the feedback it passes as `ExecuteContext.verifyFeedback` (its "Verification failed" head included) within that cap, and the LLM execute (tool loop and read-tier chat) SHALL cap verify feedback with the same excerpt, never by keeping its first 4000 chars. No flag, environment variable or config key is added.

In a repo whose SpecSync workflow requires a change for meaningful files,
the REQ-agent-518 coverage check SHALL come first: an uncovered path makes the
attempt a failed verify with no lane run; and on Corvidinho, after approving
and archiving the run's own change (REQ-agent-519), the lane SHALL run once
more over what that wrote, with the same evidence verdict, before the run is
done.

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
- A passing lane whose output has no recognised test summary, or whose tests were all skipped, is not verified: the attempt is retried with the `Verify gate: not verified: …` note first in its feedback, then ends `failed` (REQ-agent-185).
- A stub lane that passes and prints a `bun test` summary (`tests/fixtures/lane-output.ts`) ends `done` verified as before.
- In a repo whose `sdd.json` requires a change, an attempt whose real diff has a meaningful path no open change covers ends as a failed verify with no lane call, and the lane runs once a change covers it (REQ-agent-518); on Corvidinho the lane runs a second time after the own-change approve and archive, and a failure there fails the run (REQ-agent-519).

### REQUIREMENT REQ-agent-065

`buildOpenAiTools` SHALL take the acting role (`actingRole`: owner / team /
community / null) and `workTask`, and when `actingRole` is given keep exactly
the plugins `roleAllowsPlugin(actingRole, entry, workTask)` allows
(REQ-plugins-065) after the SAFE-1 allowlist, tier and SAFE-9 filters; without
it the `actingIsAdmin` filter is unchanged (ROLES-CHAT-2). `createTaskExecute`
SHALL resolve the role with `resolveActingRole(env)` on every attempt and pass
it with `workTask` (`CORVIDINHO_ACTING_WORK_TASK`), so each run's catalog is
built from the role at that moment (IDENTITY-12): owner and no role session get
today's ADMIN catalog (IDENTITY-9); team gets the read tools plus
`github-issue-comment` / `github-pr-review` when allowlisted, plus
`files-write` / `files-edit` / `specsync-change-new` /
`specsync-change-answer` in a `/work` run (IDENTITY-10, AGENT-18); community gets
today's non-ADMIN catalog (IDENTITY-11). Fledge plugin discovery stays owner /
no-role-session only. A not-offered mutating plugin the model names gets the
role refusal exactly when the role, re-resolved at that call, does not allow
it (REQ-agent-333 unchanged otherwise). A plugin marked `agentTool: false`
(`specsync-change-approve`, `specsync-change-finalize`: the run takes those
steps itself, REQ-agent-519) SHALL never be offered, whatever the role,
allowlist or tier. `PUBLIC_QA_AGENT_SYSTEM_INSTRUCTIONS`
SHALL name the only community site / roadmap sources — the public repo docs
(README, docs/, STATUS, CHANGELOG — `github-docs-read` or the project files)
and the public issues and milestones of allowed public repos
(`github-issue-list`, `github-milestone-list`) — and say nothing else counts
as the site or roadmap (ROLES-CHAT-8.a).

Acceptance Criteria
- With every dangerous plugin allowlisted, `actingRole` owner and null equal the ADMIN catalog and community equals the non-ADMIN catalog (no mutating plugin); team adds only `github-issue-comment` / `github-pr-review` (and exactly `files-write` / `files-edit` / `specsync-change-new` / `specsync-change-answer` with `workTask`); an unallowlisted review tool is not offered.
- Through `createTaskExecute` and a scripted provider: a team chat run offers the review tools but not `files-write` or `github-pr-create`; a team `/work` run adds the file tools; a team member on a community-stamped surface and an undeclared actor with a team stamp get read tools only.
- The public Q&A prompt names README, docs/, STATUS, CHANGELOG and the public issues and milestones of allowed public repos, says nothing else counts, and no longer offers "the project site, and the roadmap".
- Regression tests in `tests/roles.team.test.ts` and `tests/github.public-docs.test.ts` fail on the base sources and pass after.
- With both allowlisted, `specsync-change-approve` and `specsync-change-finalize` are offered to no role (owner included); `specsync-change-new` is offered to the owner and to team only with `workTask` (`tests/agent.repo-ways.test.ts`, `tests/roles.team.test.ts`).

### REQUIREMENT REQ-agent-086

When it repeats a failing call, it changes approach or asks me (AGENT-16,
captured from Leif's 2026-09-28 interview, round 2). The task-run tool loop
(`runToolLoop`, every surface's `task run`: CLI, Discord chat, `/session`,
`/work`, button and Answer resumes, schedules, WATCH, delegate and council
workers) SHALL keep one repeat-failure guard per `createTaskExecute`
(`createRepeatFailureGuard`, `src/agent/loop-guards.ts`), so its counts
last across the verify-retry attempts of one run. A call's identity SHALL be
`callSignature`: the tool name plus the canonical argv
(`argvFromToolArguments`, so `{"argv":["a"]}` and `["a"]` are one call).
Every tool result with `ok: false` SHALL count as a failure of its call,
refusals included (not offered, role, SAFE-1, SAFE-13, SAFE-21, a denied or
unanswered approval, an `ask-human` with no question, a thrown handler).
`changedState(name, result)` SHALL be the single "something changed"
predicate: true when the result's data reports `filesChanged` (ok or not), or
when a tool in `STATE_CHANGING_TOOLS` (file writes, git writes, GitHub
writes, Discord posts and files, memory forget / override, a SpecSync
change opened, answered, approved or archived (`specsync-change-new`,
`-answer`, `-approve`, `-finalize`, AGENT-18), `delegate`, the shell, the
language runners and `fledge-run`) or a Fledge plugin command
(`origin` `fledge:`) succeeds; never for `NO_STATE_CHANGE_TOOLS`
(`web-fetch`, `danger-ping`, `fledge-lanes-run`, `council`) or a read.
Every dangerous or mutating builtin SHALL be in exactly one of the two sets.
A change SHALL reset every count; a call's own success SHALL reset its own.

The 2nd failure of the same call with nothing changed in between
(`STEER_AFTER_FAILURES`, 2) SHALL get `repeatFailureSteer` appended after
its whole tool message (after any SAFE-12 fence or SAFE-13 note, the result
and any SAFE-21 "why" text left intact): harness text quoting a scrubbed,
one-line error excerpt of at most `STEER_ERROR_EXCERPT_MAX` (200) chars as a
JSON string (or, when the result was fenced as untrusted data because a
`delegate` / `council` worker reported an injection, `STEER_FENCED_ERROR_NOTE`
and no piece of the error, SAFE-12) and telling the model to change approach
(a different tool or different arguments) or call `ask-human`, and that the
same call again stops the run and asks the owner. Each later failure of that
call gets it too. An
identical call made in a later round of the same conversation after its steer
went out SHALL NOT run: one `ToolResult` (success false,
`REPEAT_FAILURE_BLOCK_DETAIL`) and one `[operator] AGENT-16` Text line
(scrubbed error excerpt) are emitted, and the attempt SHALL end with
`askExecuteResult(repeatedFailureAsk(label))`: the existing `stuck` reason,
question `The same <label> call keeps failing with nothing changed in
between. How should I proceed?`, where `label` is the offered tool name or
`UNKNOWN_TOOL_LABEL`, never error text or a refused plugin's name; `runTask`
then ends `blocked` with that ask and no verify, and each surface's existing
stuck path pings the owner (AUTONOMY-2/4). A steer the model has not seen yet
(an identical call in the same `tool_calls` batch, or the first identical
call in a fresh verify-retry conversation, `newConversation`) SHALL mean the
call runs and gets the steer again, never the ask. Thresholds are constants:
no env var, config key, flag, HumanAsk reason or NDJSON field is added. Not
built (not captured): a windowed "3 in 20 calls" count, did-you-mean for
unknown tool names, and a prefer-plugin steer.

Acceptance Criteria
- `callSignature` is equal for argv spellings of one call and differs for other args or tools.
- Every registered dangerous or mutating builtin is in exactly one of `STATE_CHANGING_TOOLS` / `NO_STATE_CHANGE_TOOLS`; a successful write, a failed `delegate` that reports `filesChanged` and a Fledge plugin command's success are changes; a failed write, reads, `web-fetch`, `council`, `danger-ping` and `fledge-lanes-run` are not.
- A tool that always fails, called three rounds in a row with the same argv: the 1st tool message has no steer, the 2nd ends with the steer (scrubbed error, after the whole result), the 3rd call never runs and the attempt ends with `repeatedFailureAsk("flaky-read")`, a `ToolResult` with `REPEAT_FAILURE_BLOCK_DETAIL` and an `[operator] AGENT-16` line whose error excerpt is scrubbed.
- Three identical failing calls in one batch all run (2nd and 3rd steered); the next round's identical call asks.
- After the steer, a call with different arguments runs and the model's final reply stands (no ask).
- A real change between failures resets the count: two more identical failures are needed for the steer, then the ask.
- A `council` worker that fails twice with an injection hit: its error stays inside the fence and the steer after it says `STEER_FENCED_ERROR_NOTE`, quoting none of the worker's text.
- A tool outside the catalog repeated after the steer asks with `(unknown tool)`; the summary names neither the tool nor the refusal.
- A verify retry (new conversation) whose first call repeats a call that failed twice in attempt 1 runs it and steers; its next identical call asks.
- `runTask` with that execute ends `blocked`, `ask` = the stuck ask, verified false, verify never called.
- The real CLI (`task run --output ndjson`, localhost mock LLM repeating a missing `files-read`) exits 0 with a `blocked` result frame whose `ask` is the stuck ask after exactly three LLM requests.
