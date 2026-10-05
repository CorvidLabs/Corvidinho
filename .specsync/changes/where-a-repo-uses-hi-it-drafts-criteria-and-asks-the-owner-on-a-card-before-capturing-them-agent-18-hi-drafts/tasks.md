---
change: where-a-repo-uses-hi-it-drafts-criteria-and-asks-the-owner-on-a-card-before-capturing-them-agent-18-hi-drafts
artifact: tasks
---

# Tasks

- [x] Read issue #89 (body, comments), the interview record and the repo-ways design rows; confirm AGENT-18 is captured on main and nothing new needs `hi`; `hi check` passes.
- [x] `src/agent/hi-capture-store.ts`: `HiCaptureStore`, `hi_capture_requests`, `hi_capture_files`, `hiContentKey`, `hiCaptureChainAllows`, `loadHiCaptureEdges`.
- [x] `src/agent/hi-drafts.ts`: `hiDraftGate`, `buildHiDraftToolDef` / `withHiDraftTool`, `parseHiDraftArgs`, `parseHiExport` / `readHiExport`, `validateHiDrafts`, `hiCaptureCommand`, the asks, `handleHiDraftCall`, `hiCaptureWorktreeProblem`, `ensureHiCaptureWorktree`, `runHiCapture`.
- [x] `src/agent/execute.ts` / `ask.ts`: offer and intercept `hi-draft`; the hi prompt block with and without it.
- [x] `src/agent/repo-ways.ts`: the approved-capture allowance in both comparisons; guard texts; comments in `loop.ts` and `src/work/pr.ts`; `hiRefuseMessage`.
- [x] `src/discord/hi-card.ts`, the engine's `prepare` step, bridge registration and delivery after ask-answer and `/work` runs.
- [x] `tests/agent.hi-draft.test.ts` (16), `tests/discord.hi-card.test.ts` (7), `tests/fixtures/stand-in-hi.ts`; `tests/agent.hi-guard.test.ts` and `tests/agent.repo-ways.test.ts` texts updated.
- [x] Fail-on-base proof recorded in testing.md.
- [x] Docs (`docs/discord.md`, `docs/DISCORD-GO-LIVE.md`), spec prose (agent, discord, plugins), deltas, module testing evidence.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
