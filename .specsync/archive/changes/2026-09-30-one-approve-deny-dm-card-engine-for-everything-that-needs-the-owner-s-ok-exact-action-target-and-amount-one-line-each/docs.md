---
change: one-approve-deny-dm-card-engine-for-everything-that-needs-the-owner-s-ok-exact-action-target-and-amount-one-line-each
artifact: docs
---

# Docs

- `docs/discord.md`: new "Approve / Deny cards (SAFE-18..20, #96)" section
  (what a card shows, the one-time code, no answer is no, who can answer,
  delivery); the forget-me and GitHub / `/admin` forget bullets name the code
  step and the ~5 s delivery; the file map lists the engine, store and code
  modules.
- `docs/DISCORD-GO-LIVE.md`: operator note — cards and codes arrive by DM
  from the running bridge, checked every ~5 s even with the scheduler off.
- `docs/BOX-UPDATE.md`: schema v14 (approval cards and codes); forget needs
  Approve plus the code.
- Specs: `specs/discord/discord.spec.md` (files, Public API, invariant),
  `specs/discord/testing.md`, `specs/watch/testing.md`.
