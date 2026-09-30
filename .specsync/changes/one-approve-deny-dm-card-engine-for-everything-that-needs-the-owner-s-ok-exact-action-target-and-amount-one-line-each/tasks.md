---
change: one-approve-deny-dm-card-engine-for-everything-that-needs-the-owner-s-ok-exact-action-target-and-amount-one-line-each
artifact: tasks
---

# Tasks

- [x] Read #96, Leif's 2026-09-28 interview (round 3: SAFE-18/19/20; round 6: forget-me on the card), the approvals slice record with its corrections and the conservative defaults; SAFE-18..20 are already captured on main, so no `hi` capture.
- [x] Re-verify the gap on main (1a251d1): one forget card kind, one-press Approve, a count taken at post time and targets re-resolved at Approve, delivery only on scheduler ticks / after chat, no codes, silent gateway cuts on sendDm, component reply/update, modal reply and editMessage.
- [x] Schema v14 (`src/store/db.ts`): `approval_requests`, `approval_codes`, `forget_requests.action_hash`; `SCRUB_TARGETS` (`src/store/scrub.ts`).
- [x] `src/approvals/code.ts` and `src/approvals/store.ts`.
- [x] `src/discord/approve-card.ts` (decisions, code step, form, `formatApprovalCard`, `formatApprovalTextParts`) and `src/discord/approval-cards.ts` (engine, `storedApprovalKind`).
- [x] `src/discord/forget-card.ts` as the destructive `forget` kind; `src/memory/forget.ts` `previewForgetTargets`, `resetCard`, `action_hash`; `src/memory/index.ts` exports.
- [x] `src/discord/bridge.ts` routing, owner re-check on every press and submit, typed text only from the form, own poll start/stop/settle beside #313's watch-ask wiring, `deliverApprovalCards`.
- [x] `src/discord/gateway.ts` no silent cuts (`boundedContent`); `src/discord/rich-reply.ts` defang before split and `DISCORD_DM_MAX`; `src/discord/private-reply.ts`; `src/discord/ask-buttons.ts` bounded private Choose message and short text input.
- [x] Tests: `tests/discord.approval-cards.test.ts` (17), `tests/approvals.code.test.ts` (4), `tests/discord.gateway-no-cut.test.ts` (6), `tests/fixtures/approval-code.ts`; forget tests through the code step; schema pins to 14. New tests fail on main (1a251d1) and pass on the branch.
- [x] Docs: `docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `docs/BOX-UPDATE.md`; spec prose and `files:` (`discord`), `specs/discord/testing.md`, `specs/watch/testing.md`; deltas Added REQ-discord-096, Modified REQ-discord-101 and REQ-watch-1016.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
