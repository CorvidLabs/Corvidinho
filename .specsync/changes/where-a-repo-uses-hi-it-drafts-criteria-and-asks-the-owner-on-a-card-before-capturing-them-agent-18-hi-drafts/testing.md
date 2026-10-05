---
change: where-a-repo-uses-hi-it-drafts-criteria-and-asks-the-owner-on-a-card-before-capturing-them-agent-18-hi-drafts
artifact: testing
---

# Testing

`tests/agent.hi-draft.test.ts` (16 tests) and `tests/discord.hi-card.test.ts`
(7 tests): temp git repos (a bare `origin` where the base matters) and talk
worktrees from `ensureTalkWorkspace`, never this checkout; a stand-in `hi`
CLI on PATH (`tests/fixtures/stand-in-hi.ts`: `export`, `check`, capture,
with marker files to make one capture or `hi check` fail); a scripted model
through `createTaskExecute`; stub verify runners and stub plugin calls for
`openWorkPr`; a temp DB for the card engine; the bridge with a fake gateway
for the `cvok:hi` route.

Fail-on-base proof: with the stacked base 387dadab's `src/agent/execute.ts`,
`src/agent/ask.ts`, `src/agent/repo-ways.ts`, `src/agent/loop.ts`,
`src/work/pr.ts`, `src/discord/approval-cards.ts`, `src/discord/bridge.ts`,
`src/discord/slash-types.ts`, `src/discord/command-handlers/work.ts` and
`plugins/files/protectedPaths.ts` swapped in (the new `hi-drafts.ts`,
`hi-capture-store.ts` and `hi-card.ts` kept so the files load), the two files
gave 14 pass, 9 fail: the five run cases (no `hi-draft` offered, no request,
no ask), the two guard cases that need the allowance (the next run blocked,
`/work` refused `hi-changed`), the re-created worktree (no `prepare` step)
and the bridge route (no `hi` kind). The 14 that pass exercise the new
modules directly (parsing, validation, the gate, the capture itself, the
card on the engine) or are still-blocking cases. Without the new modules the
files do not load. Restored: 23 of 23 pass.

`tests/agent.hi-guard.test.ts` (20) and `tests/agent.repo-ways.test.ts` (27)
pass with their texts updated; `tests/discord.approval-cards.test.ts`,
`tests/discord.forget-card.test.ts`, `tests/agent.ask.test.ts`,
`tests/work.pr.test.ts`, `tests/agent.execute.test.ts`,
`tests/agent.tool-loop.test.ts`, `tests/files.plugins.test.ts` and
`tests/discord.work.test.ts` still pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-521` | `tests/agent.hi-draft.test.ts` "hi-draft arguments and checks" (4), "who is offered hi-draft" (2), "a run drafts, asks and captures nothing" (6) | parsing and `validateHiDrafts` (family, captured, retired, twice, parent, length, scrub); command quoting; `card` for owner / team on chat, ask, session, work, `cli` for the local CLI, nothing for community, WATCH, schedules, workers, other surfaces, non-hi or non-git; owner chat records the request and ends with the ask; team run ends `blocked` with no lane; community not offered and refused; worker not offered; bad drafts refused one by one with nothing recorded; CLI lists the commands and records nothing. Fail on base: the five run cases. |
| `REQ-agent-522` | `tests/agent.hi-draft.test.ts` "an approved capture passes the hi guard; every other hi/ change still blocks" (4) | capture lands exactly; `hiChangesSince` empty (also committed) and the next run verified; extra criterion, other file and a pending request's ledger step still block; `/work` not `hi-changed`. Fail on base: the next-run and `/work` cases. |
| `REQ-agent-520` (modified) | `tests/agent.hi-guard.test.ts` (20), `tests/agent.repo-ways.test.ts` (27) | the guard note, the hi block with and without `hiDraft`; every guard case unchanged. |
| `REQ-discord-521` | `tests/discord.hi-card.test.ts` (7) | card content and buttons; stranger refused; owner's Approve captures, audits and tells the asker; owner re-check at Approve; Deny and lapse; re-created worktree and fail-closed with the branch gone; other branch, raced id, part-way failure and failing `hi check` put `hi/` back; the bridge route and the guard after it. Fail on base: the re-created worktree and the bridge route. |
| `REQ-discord-520` (modified) | `tests/agent.hi-draft.test.ts` "/work opens the PR for a tree whose only hi/ change is the approved capture" | not refused `hi-changed`; `git-commit` called. Fail on base: refused. |
| `REQ-plugins-520` (modified) | `tests/agent.hi-guard.test.ts` file-tool cases | the refusal names the owner's card. |
| all | full `bun test`, `fledge lanes run verify --non-interactive` | run on this branch before push. |
