---
change: verified-requires-that-tests-actually-ran-and-none-were-deleted-agent-15-a-passing-verify-lane-counts-only-when-its
artifact: design
---

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
