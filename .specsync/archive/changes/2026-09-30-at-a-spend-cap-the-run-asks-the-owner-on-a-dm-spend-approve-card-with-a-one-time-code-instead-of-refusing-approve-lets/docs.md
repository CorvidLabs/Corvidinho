---
change: at-a-spend-cap-the-run-asks-the-owner-on-a-dm-spend-approve-card-with-a-one-time-code-instead-of-refusing-approve-lets
artifact: docs
---

# Docs

- `docs/discord.md`: new "The spend card (SAFE-8 / SAFE-8.a, #98)" section
  (what the card shows, Approve plus the code lets one call through, the wait
  line, no is no, one card per paused call, no card where nobody can answer);
  the Approve/Deny intro no longer says the spend card comes later; the
  must-ask table's spend row names the `spend` card; the SAFE-14.a paragraph
  says the owner's DM names the card after a no; the file map lists
  `src/discord/spend-card.ts`.
- `docs/DISCORD-GO-LIVE.md`: E.1 gains the spend-card bullet (needs the
  bridge on the same data dir; with no owner the operator ask as before); E.9
  says a cap stop asks on the owner's card and a request timeout ending a card
  wait never falls back.
- `docs/DAEMON.md`: a daemon run at a cap waits up to 4 minutes on the
  owner's card, which only a bridge can DM; with only the daemon it lapses.
- `specs/agent/agent.spec.md` (files list, spend-card paragraph, invariant,
  scenario, error rows), `specs/discord/discord.spec.md` (files list, Public
  API, invariant, scenario, error row) and both `testing.md` files;
  requirements through the deltas.
- `hi/safe.md` and `INTENT.md` (the `hi` capture of SAFE-8.a).
- README and STATUS say nothing this makes false; no CHANGELOG or version
  edits.
