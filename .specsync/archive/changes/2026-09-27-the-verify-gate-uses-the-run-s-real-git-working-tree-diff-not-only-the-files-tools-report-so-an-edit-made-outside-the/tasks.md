---
change: the-verify-gate-uses-the-run-s-real-git-working-tree-diff-not-only-the-files-tools-report-so-an-edit-made-outside-the
artifact: tasks
---

# Tasks

- [x] Regression tests fail on main: 10 tests (9 in tests/agent.loop.test.ts, 1 end to end in tests/agent.tool-loop.test.ts) fail with main's src/agent/loop.ts, types.ts and index.ts swapped in (verify never ran; the run ended done with verifySkipped=true).
- [x] `src/agent/workspace-diff.ts`: start snapshot (HEAD, status with untracked files, content fingerprints) and `changed()` diff, read-only through `runGit` with fsmonitor off.
- [x] `runTask` adds the real diff to `filesChanged` before `wantVerify`, fails closed on an unreadable diff, takes no snapshot with the gate off.
- [x] Types, test seam and exports.
- [x] Guard tests pass on main and branch: untouched pre-run dirt, gitignored-only change, non-git cwd, gate off.
- [x] Deltas (agent Added REQ-agent-085, Modified REQ-agent-002 / REQ-agent-008; discord REQ-discord-085; watch REQ-watch-006 / REQ-watch-085); spec prose, testing.md, docs/discord.md and client header comments updated.
- [x] Full suite, typecheck, SpecSync and the verify lane green.
