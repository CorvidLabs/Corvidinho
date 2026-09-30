---
change: if-a-model-fails-or-is-retired-it-falls-back-to-my-next-configured-model-and-tells-me-agent-11
artifact: docs
---

# Docs

- `docs/DISCORD-GO-LIVE.md`: the "comma list … only its first entry is called
  for now" sentence is replaced by the fallback chain (what fails over, what
  does not, how each surface tells); the no-provider line now says "its first
  entry's key".
- `.env.example`: the comma list is a fallback chain, with an example.
- `docs/discord.md`: the footer names the model that answered (`b (fell back
  from a)`) and prices each model on the owner's runs; the fallback note stays
  whole in the last message like the role note.
- `docs/DAEMON.md`: `llm.fallback` Logs row; the model row mentions the chain.
- `docs/WATCH.md`: the `[watch] llm.fallback` line and the note.
- `README.md`: the model bullet says a list is a fallback chain.
- Specs: `agent.spec.md` (Purpose, Public API, Invariants, a scenario, error
  rows, files), `discord.spec.md`, `cli.spec.md`, `watch.spec.md`,
  `plugins.spec.md`, and each module's `testing.md`.
- No CHANGELOG / STATUS / package.json edit (the release PR writes them).
