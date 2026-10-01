---
change: in-a-hi-repo-it-never-changes-the-criteria-itself-any-hi-change-no-approved-capture-made-blocks-done-and-the-pr-agent
artifact: tasks
---

# Tasks

- [x] Confirm AGENT-18 / AGENT-18.a are captured on main; nothing new to capture; `hi check` passes.
- [x] `src/agent/repo-ways.ts`: `parseHiEntries`, `hiChangesSince`, `hiSnapshot`, `hiChangesFromSnapshot`, `hiChangeCount`, `hiChangeSummary`, `hiGuardNote`, `HI_GUARD_UNREADABLE_NOTE`, `HI_NO_CAPTURE_YET`; `SddRun.hiStart`; hi prompt block.
- [x] `src/agent/loop.ts`: one scan per verify, `hiGateNote` beside `sddGateNote`, notes joined, fail closed; planning snapshot when no git base.
- [x] `src/work/pr.ts`: `hi-changed` before the fallback re-verify, commit and push.
- [x] `plugins/files/protectedPaths.ts` (`isHiPath`, `hiRefuseMessage`) and `plugins/files/commands.ts` (`refuseHi` in write, edit, delete).
- [x] `tests/agent.hi-guard.test.ts` (17 tests); fail-on-base proof recorded in testing.md.
- [x] docs/discord.md, docs/DISCORD-GO-LIVE.md, spec prose (agent, plugins, discord), deltas and module testing evidence.
- [x] Review: `github-pr-create` inside a run refuses while hi/ changed (REQ-plugins-521); `hiChangesSince` sees assume-unchanged / skip-worktree edits and skips fsmonitor; the note says to undo only its own change; "outside a run is never checked" wording corrected; 20 tests.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
