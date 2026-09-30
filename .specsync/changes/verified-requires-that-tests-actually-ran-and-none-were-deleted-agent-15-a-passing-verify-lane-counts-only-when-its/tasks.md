---
change: verified-requires-that-tests-actually-ran-and-none-were-deleted-agent-15-a-passing-verify-lane-counts-only-when-its
artifact: tasks
---

# Tasks

- [x] `src/agent/test-evidence.ts`: runner summaries (bun test, jest, vitest, cargo test, pytest, go test), declarations (JS/TS, pytest, Go, Rust), `droppedTests`, non-git walk, verdict note.
- [x] `WorkspaceDiffTracker.testDrops()` on every tracker (run-start, carried, no-base) and `startWorkspaceDiffFrom`; `TestDrop` type; exports.
- [x] `runTask`: walk for non-git runs; a passing lane without evidence is a failed verify; note first in feedback and failure summary; one verdict note.
- [x] `/work`: merge-base none-deleted check before commit and push (`tests-deleted`); pre-push lane must show tests ran.
- [x] `tests/agent.test-evidence.test.ts`; stub lanes print a `bun test` summary; scratch non-git cwd; no-base talk test updated.
- [x] Fail-on-base proof recorded in testing.md.
- [x] Docs (`docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `README.md`), spec prose, deltas and testing evidence.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
