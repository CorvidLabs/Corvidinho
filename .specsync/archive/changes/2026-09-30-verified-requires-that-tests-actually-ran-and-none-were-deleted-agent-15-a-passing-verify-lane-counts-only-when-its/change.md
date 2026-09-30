---
id: verified-requires-that-tests-actually-ran-and-none-were-deleted-agent-15-a-passing-verify-lane-counts-only-when-its
state: archived
type: feature
base_commit: 156cfa975c6d269b7e3a183cef3c7fdb20cab4f9
---

# 'Verified' requires that tests actually ran and none were deleted (AGENT-15): a passing verify lane counts only when its output has a recognised test summary (bun test, jest, vitest, cargo test, pytest, go test) with at least one executed test and no test active at the baseline was deleted, retitled or turned off (skip, todo, silenced by only), by name across the repo root; non-git projects walk their test files at run start; /work checks the tree against the merge-base before commit and push

## Intent

'Verified' requires that tests actually ran and none were deleted (AGENT-15): a passing verify lane counts only when its output has a recognised test summary (bun test, jest, vitest, cargo test, pytest, go test) with at least one executed test and no test active at the baseline was deleted, retitled or turned off (skip, todo, silenced by only), by name across the repo root; non-git projects walk their test files at run start; /work checks the tree against the merge-base before commit and push

## Affected Canonical Specs

- `agent`
- `discord`

## Acceptance Criteria

- AGENT-15 (captured on main from Leif's 2026-09-28 interview): 'verified' requires that tests ran and none were deleted. After the verify lane passes, runTask counts executed tests from the lane output (bun test, jest, vitest, cargo test, pytest, go test summaries; skip/todo/ignored don't count): no recognised summary or zero executed ends the attempt as a failed verify whose note names the verify lane, with no opt-out (AGENT-14); every WorkspaceDiffTracker has testDrops() comparing test names at the baseline (baseline commit blobs or start text of already-dirty test files) with the working tree across the repo root, so a deleted, retitled, skipped, todo, conditional or .only-silenced test is named in the note, retry feedback (note first) and failure summary while a renamed file or a test moved to another file is not a deletion; a non-git cwd walks its test files at run start (bounded; an unfinished walk fails closed, REQ-agent-502 kept); an unreadable baseline fails closed; the carried talk baseline means later turns in a talk with a dropped test re-run the lane and stay unverified; /work compares the tree with the merge-base (startWorkspaceDiffFrom) before commit and push and refuses with reason tests-deleted naming the tests, and its pre-push lane re-run must show tests ran; tests/agent.test-evidence.test.ts fails on the base sources and passes on the branch; Corvidinho's own verify lane (bun test summary) is recognised and passes

## No-spec Rationale

Not applicable
