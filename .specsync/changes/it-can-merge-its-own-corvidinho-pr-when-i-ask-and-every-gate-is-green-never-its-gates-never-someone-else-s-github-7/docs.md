---
change: it-can-merge-its-own-corvidinho-pr-when-i-ask-and-every-gate-is-green-never-its-gates-never-someone-else-s-github-7
artifact: docs
---

# Docs

- `docs/discord.md`: the must-ask table gains the `merge` row
  (`mustask-merge`, destructive), "Not on the list" drops merges, the wait
  line names `GITHUB-7.a:`, and a new "Merging its own PR (GITHUB-7 /
  GITHUB-7.a, #124)" section (who may ask, every check, the merge, the audit
  rows).
- `docs/DISCORD-GO-LIVE.md`: `github-pr-merge` row in the allowlist table and
  a note under "What an entry unlocks" (never part of the `/work` PR step).
- `docs/WATCH.md`: WATCH runs are never offered it, the owner's own included, and it refuses inside one.
- `docs/discord.md` "In a GitHub run you triggered": `github-pr-merge` is never offered there.
- `README.md`: a short "Merging its own PR (GITHUB-7)" section.
- Specs: `plugins.spec.md` (files list, purpose, public API, invariant,
  scenario, error rows), `agent.spec.md` (self-merge offer, wait regex),
  each module's `testing.md`.
- No CHANGELOG, STATUS or package.json edit (the release PR writes them).
