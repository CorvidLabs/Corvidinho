---
change: one-approve-deny-dm-card-engine-for-everything-that-needs-the-owner-s-ok-exact-action-target-and-amount-one-line-each
artifact: research
---

# Research

- Steal notes (#96): corvid-agent `approval-manager.ts` / `approval-flow.ts`
  (requests with timeouts → `ApprovalStore` rows with `expires_at`, a no on
  expiry), `component-handlers.ts` (buttons → the `cvok:` custom ids, now with
  `code` / `submit`), `approval-format.ts` (card text → `formatApprovalCard`),
  Merlin's 8-hex 60 s confirm tokens (→ 8-character codes, 2 min, single use,
  bound to card + action hash).
- Existing pieces reused: `src/discord/rich-reply.ts` `splitDiscordMessage`
  (fence-safe split, #297), `scrubSecrets` (SAFE-6), `appendAudit` (SAFE-5),
  the DISCORD-ASK-4.a modal plumbing (`showModal` / `modalValues`,
  `adaptModalSubmit`), `resolvePermissionLevel` (owner-only ADMIN),
  `scheduleRunnerId` / `isScheduleRunnerAlive` (`<pid>:<proc start>`,
  REQ-discord-346) for the waiting process.
- The M3/M4 synthesis record (`approvals` slice, adversarial corrections)
  fixed the SAFE-5 order (code used → `started` committed → one transaction
  CAS + action → ok/error), the four silent-cut gateway paths, the missing
  `update` on modal submits (the card is edited with `editMessage`), and that
  the engine needs its own poll because the scheduler can be switched off
  (PLUGIN-5.a).
- `bun:sqlite` nested transactions use savepoints, so the forget preview runs
  the real deletes inside a transaction that always rolls back.
