---
change: at-a-spend-cap-the-run-asks-the-owner-on-a-dm-spend-approve-card-with-a-one-time-code-instead-of-refusing-approve-lets
artifact: research
---

# Research

Where each piece lived on main (0aeb345):

| Piece | Main | This change |
|---|---|---|
| 100% stop | `createSpendGuard` throws `SpendCapRefusal` with `spendCapReachedAsk` (operator action, "Replying can't lift the cap") | with an owner and `approval`, the call is held for a `spend` card first; the ask comes only on a no and names the card |
| Card engine | `src/discord/approval-cards.ts` (`storedApprovalKind`; the `money` class needs the code) | new `spendApprovalKind` (`src/discord/spend-card.ts`), registered in `bridge.ts` |
| Any-process requests | `ApprovalStore` (`request`, `waitForDecision`, `consume`); waiter `<pid>:<proc start>` closes orphans | reused as is (no schema change) |
| Wait note | must-ask `[operator] AUTONOMY-N: waiting for the owner's OK on an Approve card …`, mapped to the status by `MUST_ASK_WAIT_TEXT_RE` | the spend wait line is `AUTONOMY-8` in the same form, so the status shows it with no new regex |
| Ledger | `reserve` refuses anything past a cap | `reserveApproved` records the one approved call (fit check re-run; no row for a bigger estimate) |
| Fallback | `chatCompletions` returns a timeout failure before it checks `SpendCapRefusal` | a `SpendCapRefusal` is never a timeout failure (a card wait the request timeout cut short cannot fall back) |
| Wrapping timeouts | `COUNCIL_VOICE_TIMEOUT_MS` 5 min, `LLM_REQUEST_TIMEOUT_MS` 10 min, `DELEGATE_TIMEOUT_MS` 10 min | `SPEND_CARD_TTL_MS` 4 min |
| Project label | `projectLabel` (`src/discord/list-scope.ts`), `projectKeyFor` (`src/memory/scope.ts`) | the card text uses `projectLabel(projectKeyFor(cwd))`, never a host path |
| Owner lookup with a caller's own env | `getOwner({ env })` falls back to the home directory's allowlist file | the guard uses this process's `CORVIDINHO_ALLOWLIST_FILE` when the env names none (so a test's env never reads the operator's file) |
