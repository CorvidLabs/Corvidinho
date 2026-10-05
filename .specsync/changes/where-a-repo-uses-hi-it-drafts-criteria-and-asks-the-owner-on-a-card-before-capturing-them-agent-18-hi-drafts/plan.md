---
change: where-a-repo-uses-hi-it-drafts-criteria-and-asks-the-owner-on-a-card-before-capturing-them-agent-18-hi-drafts
artifact: plan
---

# Plan

1. `src/agent/hi-capture-store.ts` (new): the request store for the card
   engine and the capture ledger (content keys, approved-only chain check).
2. `src/agent/hi-drafts.ts` (new): the offer gate, the tool definition,
   argument parsing, `hi export` validation and the scrub check, the asks,
   `handleHiDraftCall` (records in `card` mode), the worktree check and
   re-creation, and the all-or-nothing `runHiCapture`.
3. `src/agent/execute.ts`: offer `hi-draft` per attempt; intercept the call
   like `ask-human`; the prompt block knows whether it is offered.
   `src/agent/ask.ts`: `ChatToolDef` includes it.
4. `src/agent/repo-ways.ts`: `withoutApprovedCaptures` in `hiChangesSince` and
   `hiChangesFromSnapshot`; the guard texts. Comment lines in `loop.ts` and
   `src/work/pr.ts`; the refusal text in `plugins/files/protectedPaths.ts`.
5. `src/discord/hi-card.ts` (new): the `hi` kind. `approval-cards.ts`: the
   optional `prepare` step. `bridge.ts`: register the kind; a card pass after
   ask-answer runs; `deliverApprovalCards` on the slash context, called when a
   `/work` run ends (`command-handlers/work.ts`, `slash-types.ts`).
6. Tests (`tests/agent.hi-draft.test.ts`, `tests/discord.hi-card.test.ts`,
   stand-in `hi` fixture), the two existing tests whose texts changed, specs,
   docs, deltas; fail-on-base proof; verify.
