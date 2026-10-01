---
change: before-a-pr-opens-a-second-model-reviews-the-diff-in-bounded-rounds-and-the-pr-lists-what-it-raised-and-what-changed
artifact: docs
---

# Docs

- `README.md`: new "Second-model review before a PR (GITHUB-9)" section
  (bounded rounds, the reviewer, configure two models, no reviewer setting).
- `docs/discord.md`: the /work gate table gets the GITHUB-9 row, and a new
  "Second-model review before every PR (GITHUB-9 / GITHUB-9.a)" section
  (reviewer, rounds, open, no run model, refusals, spend cap, footer, table).
- `docs/DISCORD-GO-LIVE.md`: the `github-pr-create` allowlist row and the
  "what an entry unlocks" list say a PR needs a finished second-model review
  and two configured models.
- `docs/WATCH.md`: the outbound writes paragraph says the same and how a
  dry run reads the branch tree.
- Specs: `plugins.spec.md` (files, Purpose, Public API, Invariants, Error
  Cases, Dependencies), `agent.spec.md` (Public API), `discord.spec.md`
  (/work `not-reviewed`, `SCRUB_TARGETS`), each module's `testing.md`.
- No CHANGELOG / STATUS / package.json edit (the release PR writes them).
