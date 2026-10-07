---
change: my-own-memory-forget-and-override-by-id-ask-me-on-a-dm-card-with-approve-and-a-one-time-code-and-an-override-shows-the
artifact: context
---

# Context

- Leif's 2026-09-28 interview, round 17 (2026-10-07, record
  `/home/user/coord/interview-2026-09-28.md`): "SAFE-18 owner forget/override
  by id: **DM card** — a destructive DM Approve card with the one-time code
  replaces the typed chat token; an override shows the new text verbatim."
  Captured in this PR as SAFE-18.a with `hi` (own commit), under SAFE-18.
- Before: `memory-forget` / `memory-override` (owner-only, MEMORY-ACL-3/4)
  were SAFE-4 two-phase with a typed HMAC token (`src/memory/confirm.ts`,
  REQ-plugins-011): phase 1 returned a token, the human retyped it in a new
  message, the bridge extracted it into `CORVIDINHO_ACTING_CONFIRM_TOKENS`,
  phase 2 ran with `--confirm`.
- The #316 approvals engine (`src/discord/approval-cards.ts`, SAFE-18..20)
  already carries destructive cards with the SAFE-19 one-time code
  (`forget`, `mustask`, `spend`); `storedApprovalKind` serves kinds over
  `approval_requests`, and the must-ask gate shows the waiting-run pattern
  (record, `waitForDecision`, `consume` once).
- Settled rules: specs only through SpecSync; owner admins, team works; v1
  off-chain; self-merge only in Corvidinho; #232/#233 untouched.
