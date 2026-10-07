---
change: my-own-memory-forget-and-override-by-id-ask-me-on-a-dm-card-with-approve-and-a-one-time-code-and-an-override-shows-the
artifact: research
---

# Research

- Sources: the interview record (round 17), `hi/safe.md` (SAFE-4, SAFE-5,
  SAFE-18..20), REQ-plugins-011, REQ-discord-021 / -096 / -097 / -101.
- Card engine (`src/discord/approval-cards.ts`): kinds register a store and
  class; destructive ⇒ Approve issues a one-time code DMed apart, typed in a
  form, valid once for that card's action hash, 2 min; a card's text is sent
  first, verbatim, fence-safe and scrubbed; never cut; a gone waiter or
  expiry closes as a no. `storedApprovalKind` over `approval_requests`
  (scrubs every field at record time) is what `mustask` and `spend` use.
- Waiting-run pattern: `src/plugins/must-ask.ts` (`ApprovalStore.request` →
  `waitForDecision` → `consume`), with a test seam (`setMustAskTestHooks`).
- `MemoryStore.override` scrubs content on write (SAFE-6), the same
  `scrubSecrets` `ApprovalStore.request` applies to the card's text, so the
  card shows exactly what would be stored.
- Token path consumers: only `memory-forget` / `memory-override` and the
  Discord spawn's extraction; WATCH clears the env; delegate / council
  workers never get it (unchanged).
- `bridgeRunning` (`src/watch/owner-ask.ts`) is marked only when the bridge
  runs its scheduler, so it can't tell whether the card engine runs.
