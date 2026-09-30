---
change: one-approve-deny-dm-card-engine-for-everything-that-needs-the-owner-s-ok-exact-action-target-and-amount-one-line-each
artifact: requirements
---

# Requirements

- Added **REQ-discord-096** (delta `deltas/discord.md`): the Approve/Deny card
  engine — kind registry and classes, `ApprovalStore`, delivery (exact card,
  diff/text parts first, buttons last, never cut, own poll), answering
  (owner re-check on every press and submit, typed text only from the form,
  action-hash re-check), one-time codes (SAFE-19), SAFE-5 order, no answer
  is no (SAFE-20), the gateway's no-cut rule, schema v14.
- Modified **REQ-discord-101** (delta `deltas/discord.md`): the forget ask is
  the engine's destructive `forget` kind — delivered on the engine's poll,
  exact counts from a rolled-back preview, Approve re-checks them and needs
  the one-time code, the code is used before `started`, the delete re-checks
  what the card showed inside the transaction.
- Modified **REQ-watch-1016** (delta `deltas/watch.md`): a GitHub forget ask's
  approval takes Approve and the one-time code; the poller is unchanged.
- HI: SAFE-18, SAFE-19, SAFE-20 (captured on main from Leif's 2026-09-28
  interview, round 3; nothing new captured). MEMORY-ACL-6 / 6.a, SAFE-5,
  SAFE-6, DISCORD-7, IDENTITY-2 unchanged. No acceptance criteria beyond the
  captured text; open design points are listed in `design.md` for Leif.
