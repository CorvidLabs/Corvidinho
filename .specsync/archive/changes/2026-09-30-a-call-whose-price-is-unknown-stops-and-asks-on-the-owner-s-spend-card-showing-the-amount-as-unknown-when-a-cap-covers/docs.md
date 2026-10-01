---
change: a-call-whose-price-is-unknown-stops-and-asks-on-the-owner-s-spend-card-showing-the-amount-as-unknown-when-a-cap-covers
artifact: docs
---

# Docs

- `docs/discord.md`: "The spend card" gains "A price it does not know shows as
  unknown" (the unknown-price card, one call per Approve, no override) and
  "Spend with unknown calls reads $X + unknown"; "No card where nobody can
  answer" no longer lists the unpriced model; the scheduled-questions
  paragraph says a spend-cap stop has the owner's **Continue** and **Cancel**;
  new "GitHub runs stopped at a spend cap" paragraph after the stuck-asks one.
- `docs/DISCORD-GO-LIVE.md` (E.1): the unpriced model asks on the card with the
  amount unknown; owner spend lines read `$X + unknown`.
- `docs/DAEMON.md`: an unpriced call asks on the same card; a spend-cap stop
  has Continue (the owner's) and Cancel.
- `docs/WATCH.md`: "Spend-cap stops reach the owner too".
- `specs/agent/agent.spec.md` (files list, the unknown-price paragraph,
  invariant, scenario, error row), `specs/discord/discord.spec.md` (Public
  API: `SPEND_CARD_UNKNOWN_APPROVED`, `formatWatchSpendStopDm`,
  `continued`, the Continue control; scenario), `specs/watch/watch.spec.md`
  (purpose, Public API, behaviour, scenario) and the three `testing.md`
  files; requirements through the deltas.
- `hi/safe.md` and `INTENT.md` (the `hi` capture of SAFE-16.a).
- README and STATUS say nothing this makes false; no CHANGELOG or version
  edits.
