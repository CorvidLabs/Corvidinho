# Lesson bundle — verified-requires-that-tests-actually-ran-and-none-were-deleted-agent-15-a-passing-verify-lane-counts-only-when-its

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: 'Verified' requires that tests actually ran and none were deleted (AGENT-15): a passing verify lane counts only when its output has a recognised test summary (bun test, jest, vitest, cargo test, pytest, go test) with at least one executed test and no test active at the baseline was deleted, retitled or turned off (skip, todo, silenced by only), by name across the repo root; non-git projects walk their test files at run start; /work checks the tree against the merge-base before commit and push
- **Kind**: Feature
- **Specs**: agent, discord
- **Paths**: README.md, docs/DISCORD-GO-LIVE.md, docs/discord.md, specs/agent/agent.spec.md, specs/agent/testing.md, specs/discord/discord.spec.md, specs/discord/testing.md, src/agent/index.ts, src/agent/loop.ts, src/agent/types.ts, src/agent/workspace-diff.ts, src/work/pr.ts, tests/agent.ask.test.ts, tests/agent.execute.test.ts, tests/agent.loop-guards.test.ts, tests/agent.loop.test.ts, tests/agent.tool-loop.test.ts, tests/agent.verify-gate.test.ts, tests/work.pr.test.ts, src/agent/test-evidence.ts, tests/agent.test-evidence.test.ts, tests/fixtures/lane-output.ts
- **Acceptance**: AGENT-15 (captured on main from Leif's 2026-09-28 interview): 'verified' requires that tests ran and none were deleted. After the verify lane passes, runTask counts executed tests from the lane output (bun test, jest, vitest, cargo test, pytest, go test summaries; skip/todo/ignored don't count): no recognised summary or zero executed ends the attempt as a failed verify whose note names the verify lane, with no opt-out (AGENT-14); every WorkspaceDiffTracker has testDrops() comparing test names at the baseline (baseline commit blobs or start text of already-dirty test files) with the working tree across the repo root, so a deleted, retitled, skipped, todo, conditional or .only-silenced test is named in the note, retry feedback (note first) and failure summary while a renamed file or a test moved to another file is not a deletion; a non-git cwd walks its test files at run start (bounded; an unfinished walk fails closed, REQ-agent-502 kept); an unreadable baseline fails closed; the carried talk baseline means later turns in a talk with a dropped test re-run the lane and stay unverified; /work compares the tree with the merge-base (startWorkspaceDiffFrom) before commit and push and refuses with reason tests-deleted naming the tests, and its pre-push lane re-run must show tests ran; tests/agent.test-evidence.test.ts fails on the base sources and passes on the branch; Corvidinho's own verify lane (bun test summary) is recognised and passes

## Evidence

- Verification commit: `87cac5aa913aacae2070338f1f2fd80b9308143a`
- Base commit: `156cfa975c6d269b7e3a183cef3c7fdb20cab4f9`
- Verified by: `specsync check --spec agent --spec discord`

## From the change's context.md

# Context

Issue #85 (M3 "Real dev teammate"), slice verify-gate-2 of the M3/M4 plan.
AGENT-15 is captured on main ("The real git diff decides what changed, and
'verified' requires that tests ran and none were deleted."), confirmed as
written by Leif in the 2026-09-28 interview (round 2: "verified = real diff
+ tests ran + none deleted"). #308 (verify-gate-1) built the real-diff half,
AGENT-14 and AGENT-15.a; this change builds the tests-ran / none-deleted
half. Nothing new is captured in `hi/`.

What was wrong on main (156cfa9):

- A verify lane that exits 0 counted as verified whatever it ran: a lane with
  no test step, or whose tests were all skipped, said "verified".
- A run could delete a test, retitle it, turn it into `.skip` / `.todo` or
  silence it with `.only`, and the passing lane then called the change
  verified.
- /work trusted the run's `verified` (or a pre-push lane exit code) and
  pushed a branch whose earlier commits dropped tests.

Constraints: specs only through SpecSync; no new env var, config key, flag,
slash command, table, schema bump or NDJSON field; `src/plugins/run.ts`,
`src/plugins/must-ask.ts` and provider / tier code untouched (must-ask-gate
and providers-1 are in flight); #232/#233 scope untouched; REQ-agent-502's
non-git fail-closed rule kept. Conservative defaults come from
`/home/user/coord/m34-defaults.md` (slice verify-gate) and are listed in the
PR under "Design choices pending Leif".

## From the change's design.md

# Design

- **Test evidence module** (`src/agent/test-evidence.ts`, new):
  `countExecutedTests(output)` per runner (executed = passed + failed; skip /
  todo / ignored never count), `testDeclarations(path, source)` (a small JS/TS
  tokenizer that drops comments, strings and regex literals and reads
  `test` / `it` / `describe` calls with their modifier chains and suite
  ranges; line-based pytest; comment-stripped Go and Rust), `droppedTests`
  (names across all changed files, one match per declaration: each baseline
  test needs one that runs at least as much, running > conditional > off;
  moves keep names),
  `startTestNameWalk` (non-git snapshot), `judgeTestEvidence` (one note for
  every problem) and `formatTestDrops` (bounded).
- **Tracker** (`src/agent/workspace-diff.ts`): every tracker gets
  `testDrops()`. At a run-start snapshot the root-wide dirty test files are
  read once (stat identity + declarations); `testDropsFrom(baseHead, dirt)`
  lists the root-wide status and `HEAD` diff, reads baseline blobs of the
  changed test files (`ls-tree` then `cat-file blob`) or the start text of
  dirty ones, and the working tree. A carried talk uses the merge-base with
  no dirt (shared `fromCommit`); no base → null. `startWorkspaceDiffFrom`
  exposes `fromCommit` for /work. `openProject` factors the root / git set-up.
- **Gate** (`src/agent/loop.ts`): with no tracker, a walk is taken at run
  start. After a passing lane, `testDrops()` and `judgeTestEvidence` decide;
  a failing verdict turns the result into a failed verify (same retry /
  stuck-ask path), the note leads the feedback and the failure summary and
  ends the `VerifyResult` output (its NDJSON cap keeps the tail). One `Text`
  note either way.
- **/work** (`src/work/pr.ts`): after the repo gate and before the lane
  re-run, commit and push, `startWorkspaceDiffFrom(worktree, mergeBase)
  .testDrops()`; null or drops → `tests-deleted`. The pre-push lane must also
  pass `judgeTestEvidence(output, [])`.
- **Fail closed everywhere**: a baseline, listing, blob or file that cannot
  be read, or a walk over its cap, is "could not read", never "none deleted".

## From the change's testing.md

# Testing

Temp git repos, talk worktrees made by the product's own
`ensureTalkWorkspace`, scratch non-git projects, stub verify runners, a
fake `fledge` on PATH, a bare `origin` for /work and stubbed plugins. No
network, no key; no test runs the repo's own snapshot or verify lane. One
test runs the real `bun test` on a two-test scratch file to prove its
summary is recognised.

Fail-on-base proof: with the base's (156cfa9) `src/agent/loop.ts`,
`src/agent/workspace-diff.ts`, `src/agent/types.ts`,
`src/agent/index.ts` and `src/work/pr.ts` swapped in (the new
`src/agent/test-evidence.ts` kept so the test file loads),
`bun test tests/agent.test-evidence.test.ts tests/agent.verify-gate.test.ts
tests/agent.loop.test.ts tests/work.pr.test.ts tests/agent.tool-loop.test.ts
tests/agent.execute.test.ts tests/agent.ask.test.ts` gave 153 pass, 20 fail:
every gate, non-git, real-CLI and /work case of the new file (the base
verifies a passing lane with no summary, a deleted / skipped / retitled /
`.only`-silenced test, and opens the /work PR) and the no-base talk case
of `tests/agent.verify-gate.test.ts` (verified on the base). The pure
summary and declaration units pass on both. Restored: all pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-185` | `tests/agent.test-evidence.test.ts` ("tests ran: the lane's test summary") | `bun test` pass + fail counted, skip / todo not, all-skipped = 0; the real `bun test` output of this Bun (FORCE_COLOR, stdout then stderr) recognised with 2 executed; jest 6, vitest 5, cargo 5 (two binaries), pytest 4 / 3 (`==`, `-q` with colour), `no tests ran` = 0, go `ok` packages 1, go `-v` 2, `[no test files]` = 0; "ok", "All checks passed." not recognised; the verdict names the verify lane and runners, says no test ran, names drops and stays under 2000 chars for 40 long names. |
| `REQ-agent-185` | `tests/agent.test-evidence.test.ts` ("test declarations") | JS/TS `.skip`, `.todo`, `xit`, a skipped `describe` and comments are not active, `.skipIf` / `.if` / `describe.skipIf` are conditional; `.each` and templates are active; a `.only` silences its file's others. pytest skip decorators (multi-line; `skipif` and a module skipif `pytestmark` conditional), `Test*` classes, a skipped class, docstrings; Go `TestX` outside comments; Rust `#[test]` / `#[tokio::test]`, `#[ignore]` off. Test-file paths. `droppedTests`: move / rename not a drop, retitle and a removed duplicate are; deleting an already-off test is, keeping it off is not; a conditional test deleted or turned off and a running one made conditional are, one kept conditional, made to run or moved is not. |
| `REQ-agent-185` | `tests/agent.test-evidence.test.ts` ("the gate") | No summary → not verified, retry feedback starts with the note naming the verify lane, both `VerifyResult` false; all-skipped → "no test ran"; tests ran → `done` verified with "12 test(s) ran (bun test: 12), and none were deleted."; a deleted test named in the retry's feedback, restored → verified; deleting the file, `.skip`, `.todo`, sibling `.only`, retitle, comment-out each named; deleting a `.skipIf`, a `describe.skipIf` or a `.skip` test named, keeping them in a touched file verified; renamed / moved file and a moved test verified; a shell commit's deletion seen; a pre-run dirty test file compared with its start text; a subdirectory run sees a root-level deletion; a carried talk re-runs the lane on each later turn and stays unverified; no base / missing commit → `testDrops()` null. All fail on the base. |
| `REQ-agent-185` | `tests/agent.test-evidence.test.ts` ("a project with no git work tree") | Non-git `.skip` named; a renamed file verified; a walk over its cap and a missing dir → null (fail closed, REQ-agent-502 kept). |
| `REQ-agent-185` | `tests/agent.test-evidence.test.ts` ("the real CLI") | Carried talk worktree, fake `fledge` exit 0: no summary → exit 1 `failed`; a `bun test` summary on stderr → exit 0 `done` verified. Fails on the base (verified with no summary). |
| `REQ-agent-185` | `tests/agent.verify-gate.test.ts` | A talk whose base branch cannot be found still runs the lane with the unreadable-diff note and now ends `failed` with "could not read the test files" (verified on the base). |
| `REQ-agent-002` | `tests/agent.loop.test.ts`, `tests/agent.tool-loop.test.ts`, `tests/agent.execute.test.ts`, `tests/agent.ask.test.ts` | Verify fail then pass (the pass stub prints a `bun test` summary, `LANE_PASS_OUTPUT`) ends verified with feedback; exhausted retries fail; the AGENT-4.a feedback cases unchanged; in-process tool-reported runs use an empty scratch cwd (`NON_GIT_CWD`). |
| `REQ-discord-185` | `tests/agent.test-evidence.test.ts` ("/work checks the tree against the merge-base") | A test removed in an earlier branch commit → `tests-deleted`, the line names `"keeps order" (tests/math.test.ts)` and `main`, no plugin call, no lane, nothing on the remote; a `git mv` rename with a no-summary pre-push lane → `verify-failed`; with a `bun test` summary → opened `pre-push` via `git-commit` → `git-push` → `github-pr-create`. Both fail on the base. |
| `REQ-discord-185` | `tests/work.pr.test.ts` | The pre-push stub that must ship prints a `bun test` summary; every other /work case unchanged and green. |

## Where these lessons go

- `specs/agent/context.md`
- `specs/discord/context.md`
