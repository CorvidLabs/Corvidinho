---
change: verification-can-t-be-skipped-and-the-real-diff-since-the-talk-started-decides-what-changed-agent-14-agent-15-agent-15
artifact: tasks
---

# Tasks

- [x] Capture AGENT-15.a with `hi` in its own commit; `hi check` passes.
- [x] Remove `AgentConfig` / `RunTaskOptions.verifyBeforeComplete`; `verify_before_complete` ignored; `removedVerifyKeys` + doctor `[warn] verify-gate`.
- [x] `--no-verify` refused before anything runs (exit 1 / `{ ok:false, error }`); help and usage no longer list it.
- [x] Gate always on, snapshot always taken, "no changes, nothing to verify" note; demo stub claims nothing.
- [x] `filesChanged` from the real diff alone; ghost claims run the lane with one note; a failed verify re-verifies every later attempt.
- [x] `resolveBase` moved to `src/worktree/base.ts` (shared with /work); talk marker helpers; `ensureTalkWorkspace` writes the marker; carried tracker; `runTask` settles.
- [x] `tests/agent.verify-gate.test.ts` + `tests/fixtures/talk-worktree.ts`; loop / CLI / config / dangerous / doctor / argv tests rewritten; real-CLI tests moved to scratch projects.
- [x] Fail-on-base proof recorded in testing.md.
- [x] AGENTS.md, docs/discord.md, docs/WATCH.md, fledge.toml, spec prose, deltas and testing evidence updated.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
