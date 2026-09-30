---
change: verified-requires-that-tests-actually-ran-and-none-were-deleted-agent-15-a-passing-verify-lane-counts-only-when-its
artifact: testing
---

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
| `REQ-agent-185` | `tests/agent.test-evidence.test.ts` ("test declarations") | JS/TS `.skip`, `.todo`, `xit`, `.skipIf`, a skipped `describe` and comments are not active; `.each` and templates are; a `.only` silences its file's others. pytest skip decorators (multi-line), `Test*` classes, a skipped class, docstrings; Go `TestX` outside comments; Rust `#[test]` / `#[tokio::test]`, `#[ignore]` off. Test-file paths. `droppedTests`: move / rename not a drop, retitle and a removed duplicate are, an already-off test is not. |
| `REQ-agent-185` | `tests/agent.test-evidence.test.ts` ("the gate") | No summary → not verified, retry feedback starts with the note naming the verify lane, both `VerifyResult` false; all-skipped → "no test ran"; tests ran → `done` verified with "12 test(s) ran (bun test: 12), and none were deleted."; a deleted test named in the retry's feedback, restored → verified; deleting the file, `.skip`, `.todo`, sibling `.only`, retitle, comment-out each named; renamed / moved file and a moved test verified; a shell commit's deletion seen; a pre-run dirty test file compared with its start text; a subdirectory run sees a root-level deletion; a carried talk re-runs the lane on each later turn and stays unverified; no base / missing commit → `testDrops()` null. All fail on the base. |
| `REQ-agent-185` | `tests/agent.test-evidence.test.ts` ("a project with no git work tree") | Non-git `.skip` named; a renamed file verified; a walk over its cap and a missing dir → null (fail closed, REQ-agent-502 kept). |
| `REQ-agent-185` | `tests/agent.test-evidence.test.ts` ("the real CLI") | Carried talk worktree, fake `fledge` exit 0: no summary → exit 1 `failed`; a `bun test` summary on stderr → exit 0 `done` verified. Fails on the base (verified with no summary). |
| `REQ-agent-185` | `tests/agent.verify-gate.test.ts` | A talk whose base branch cannot be found still runs the lane with the unreadable-diff note and now ends `failed` with "could not read the test files" (verified on the base). |
| `REQ-agent-002` | `tests/agent.loop.test.ts`, `tests/agent.tool-loop.test.ts`, `tests/agent.execute.test.ts`, `tests/agent.ask.test.ts` | Verify fail then pass (the pass stub prints a `bun test` summary, `LANE_PASS_OUTPUT`) ends verified with feedback; exhausted retries fail; the AGENT-4.a feedback cases unchanged; in-process tool-reported runs use an empty scratch cwd (`NON_GIT_CWD`). |
| `REQ-discord-185` | `tests/agent.test-evidence.test.ts` ("/work checks the tree against the merge-base") | A test removed in an earlier branch commit → `tests-deleted`, the line names `"keeps order" (tests/math.test.ts)` and `main`, no plugin call, no lane, nothing on the remote; a `git mv` rename with a no-summary pre-push lane → `verify-failed`; with a `bun test` summary → opened `pre-push` via `git-commit` → `git-push` → `github-pr-create`. Both fail on the base. |
| `REQ-discord-185` | `tests/work.pr.test.ts` | The pre-push stub that must ship prints a `bun test` summary; every other /work case unchanged and green. |
