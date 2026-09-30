---
module: agent
change: verified-requires-that-tests-actually-ran-and-none-were-deleted-agent-15-a-passing-verify-lane-counts-only-when-its
---

# Delta: agent ('verified' requires that tests actually ran and none were deleted — AGENT-15)

## Added

### REQUIREMENT REQ-agent-185

Tests ran and none deleted (AGENT-15, captured on main from Leif's
2026-09-28 interview: "The real git diff decides what changed, and
'verified' requires that tests ran and none were deleted."; this builds the
tests-ran / none-deleted half). After the verify lane passes, `runTask` SHALL
count the run as verified only when both hold, else the attempt SHALL be a
failed verify (the `VerifyResult` event has `success: false` and the lane
output followed by the note; the retry's `verifyFeedback` starts with the
note after its "Verification failed" head, within the 4000-char cap; the
failure summary puts the note before the lane output) with no opt-out
(AGENT-14), and one `Text` event SHALL carry the verdict note either way
(`Verify gate: N test(s) ran (<runner>: N, …), and none were deleted.`, or
`Verify gate: not verified: …` naming every problem):

1. Tests ran: `countExecutedTests(output)` (`src/agent/test-evidence.ts`)
   SHALL read, with colour escapes dropped, only runners with a reliable
   summary line: `bun test` (the ` N pass` / ` N fail` lines above
   `Ran N tests across M files.`), jest (`Tests: … N total`), vitest
   (`Tests  … (N)`), `cargo test` (every `test result:` line), pytest (the
   `N passed, … in Xs` line, `no tests ran`) and `go test` (top-level
   `--- PASS:` / `--- FAIL:` lines, else one per `ok <pkg>` line without
   `[no tests to run]`; `[no test files]` = 0). Executed = passed + failed
   (pytest also xfailed / xpassed); skipped, todo and ignored tests never
   count. No recognised summary SHALL fail closed with a note that names the
   verify lane (`fledge lanes run verify`) and the recognised runners; a
   recognised summary with no executed test SHALL fail with a note saying no
   test ran.
2. None deleted: every `WorkspaceDiffTracker` SHALL have `testDrops()`,
   which compares the tests declared in the test files that differ from its
   baseline across the whole repo root (not only the cwd's subtree): the
   baseline side from the baseline commit's blobs (`git ls-tree` /
   `git cat-file`, read-only), or, for a test file already dirty or
   untracked at the start, from its text read at the start (untouched since,
   by stat identity, it is skipped); the other side from the working tree
   (no symlink followed). Test files are JS/TS `*.test.*`, `*.spec.*`,
   `*_test.*`, `*_spec.*`, `*_test_.*` and `__tests__/`, pytest `test_*.py`
   / `*_test.py`, Go `*_test.go` and Rust `.rs`. A declaration is off when
   it is `.skip`, `.todo`, `x`-prefixed, inside a skipped suite, silenced by
   an `.only` elsewhere in its file, a `skip`-marked pytest test, class or
   module, or a Rust `#[ignore]` test; otherwise it is conditional (it may
   run here) when it or its suite is `.if`, `.skipIf`, `.todoIf` or
   `.runIf`, or pytest `skipif` / `skipUnless`; otherwise it runs.
   Commented-out code is not a declaration. `droppedTests` SHALL match names
   (once per declaration) across all the changed files: every baseline
   declaration needs one with its name that runs at least as much (a running
   test a running one, a conditional test a running or conditional one, a
   test already off any declaration). So a renamed or moved file, or a test
   moved to another file, keeps its name and is not a drop, while a deleted
   or retitled test (conditional or already off included), a running test
   made conditional or off, and a conditional test turned off are, and the
   note SHALL name each as `"name" (file)` (up to 10 and
   1500 chars, then "and N more"). A baseline git cannot give (a carried talk
   whose base branch cannot be found, a commit that is gone), a status
   listing git cannot read, a test file over 4 MiB or unreadable, over 2000
   changed test files or over 64 MiB of test source SHALL make `testDrops()`
   null, and the run is not verified ("could not read the test files").
3. With no git snapshot (a non-git cwd, or an unreadable start snapshot;
   REQ-agent-502's rule that such a run verifies after an unreported edit is
   kept), `runTask` SHALL walk the cwd's test files at run start
   (`startTestNameWalk`: no symlink followed, dot-directories and
   `node_modules`, `target`, `vendor`, `dist`, `build`, `coverage`, `venv`,
   `__pycache__` skipped) and compare a second walk after the lane passes; a
   walk over 20000 entries or that cannot read the cwd SHALL fail closed.

In a talk worktree the carried baseline (REQ-agent-015) applies here too, so
a run after one that did not end verified checks every test dropped since the
talk started, and every later turn re-runs the lane until one ends verified.
`startWorkspaceDiffFrom(cwd, commit)` SHALL give a tracker whose baseline is
`commit` with no dirt (for /work, REQ-discord-185). No env var, config key,
flag, slash command, table or NDJSON field is added.

Acceptance Criteria
- `countExecutedTests` counts pass + fail for `bun test` (skip / todo not), recognises the real `bun test` output of this Bun (stdout then stderr, colour on), jest, vitest, `cargo test` (summed), pytest (`==` and `-q`, `no tests ran` = 0) and `go test` (`-v` or `ok` packages); "ok" and other lines are not a summary.
- In a temp git repo with a passing stub lane: no recognised summary → not verified, the retry's feedback starts with the note naming the verify lane, both `VerifyResult` events `success: false`; an all-skipped summary → "no test ran"; a summary with tests and no drop → `done` verified with the "N test(s) ran … none were deleted" note.
- Deleting a test file, `.skip`, `.todo`, a sibling `.only`, a retitle and commenting a test out each end not verified with `"<name>" (tests/math.test.ts)` in the note; a retry that restores the test ends `done` verified.
- Deleting a `.skipIf` test, a test in a `describe.skipIf` suite or an already-skipped test ends not verified with each named, and touching their file while keeping them is verified; `droppedTests` makes a conditional test deleted or turned off, and a running test made conditional, a drop, and a conditional test kept conditional, made to run or moved not one; pytest `skipif` (a decorator or a module `pytestmark`) is conditional and `skip` is off.
- A renamed or moved test file and a test moved to another file are verified; a deletion committed through a shell is seen; a test file dirty before the run is compared with its start text; a run in a subdirectory sees a test deleted outside it.
- A carried talk whose blocked run deleted a test re-runs the lane on each later turn and stays unverified; a tracker whose base branch or commit git cannot give returns null from `testDrops()`.
- Non-git: a `.skip` is named, a renamed file is verified; a walk over its entry cap or of a missing dir returns null.
- The real CLI in a carried talk with a fake `fledge` that exits 0: no summary → exit 1, `failed`; a `bun test` summary → exit 0, `done` verified.

## Modified

### REQUIREMENT REQ-agent-002

When the run changed files (in the run's real git working-tree diff per REQ-agent-085, or, with no git snapshot, reported by a tool) or a tool claimed a change git does not show, completion SHALL run `fledge lanes run verify --non-interactive`; there is no switch that skips it (AGENT-14, REQ-agent-003). Pass → `verified=true` only when the lane's output also shows that tests ran and no test was deleted or turned off since the baseline (AGENT-15, REQ-agent-185); a passing lane without that evidence is a failed verify like any other, whose note leads the retry's feedback. Fail with retries remaining → re-enter executing with verifier output. Exhausted retries → terminal failure with `verified=false` (AGENT-4 / AGENT-4.a / FLEDGE-2). The default runner SHALL spawn fledge with the parent's env minus the delegate worker drop list (`DISCORD_*`, `GITHUB_TOKEN`, `GH_TOKEN`, `CORVIDINHO_AUDIT_HMAC_KEY` and every `CORVIDINHO_ACTING_*` key) and the LLM API keys (`CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`), keeping every other inherited key, so tests the agent wrote never see operator secrets (SAFE-6). The verifier output a retry gets SHALL be the failing step's, not the start of the lane log (AGENT-4.a): output within `VERIFY_FEEDBACK_MAX_CHARS` (4000) is passed whole; over it, `verifyFeedbackExcerpt` SHALL drop colour escapes, name the failing step (from fledge's `Lane '<lane>' failed at step N (<name>)` line; a parallel step is `parallel(<tasks>)`) and keep that step's output from its `Running task: <name>` marker (a parallel step's from its `Running parallel:` line) when it fits, else its error / fail lines (lines that report a failure, such as `error:`, `Expected:`, `(fail)` or `file(1,2): error TS…`, before lines that only mention one; first ones first; passing-test lines left out; printed in log order) and the end of the log, in at most 4000 chars and never cut inside a surrogate pair. `runTask` SHALL keep the feedback it passes as `ExecuteContext.verifyFeedback` (its "Verification failed" head included) within that cap, and the LLM execute (tool loop and read-tier chat) SHALL cap verify feedback with the same excerpt, never by keeping its first 4000 chars. No flag, environment variable or config key is added.

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
