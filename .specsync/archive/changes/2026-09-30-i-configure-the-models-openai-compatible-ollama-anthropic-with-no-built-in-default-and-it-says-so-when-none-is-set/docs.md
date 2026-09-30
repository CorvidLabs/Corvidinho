---
change: i-configure-the-models-openai-compatible-ollama-anthropic-with-no-built-in-default-and-it-says-so-when-none-is-set
artifact: docs
---

# Docs

- `docs/DISCORD-GO-LIVE.md`: env block lists `CORVIDINHO_LLM_MODEL` as
  required with the three kinds and their keys; section C says doctor warns
  when no provider is usable; E.4 names the model and its key; new E.9
  "Models: you configure them; there is no default" with the upgrade note
  (key-only setups must set `CORVIDINHO_LLM_MODEL`), the kinds table and
  where the notice appears.
- `README.md`: Requirements names the model you configure and links E.9.
- `.env.example`: the LLM block explains `kind:model`, `OLLAMA_HOST`,
  `ANTHROPIC_API_KEY` and that there is no default.
- `docs/DAEMON.md`: env table row for the model and keys, `daemon.started`
  `llm` field and an `llm.no_provider` Logs row, unit file comment.
- `docs/discord.md`: the `/status` row describes the LLM line.
- `AGENTS.md`: the `task run` bootstrap comment no longer says "demo stub".
- Specs: `agent.spec.md` (Purpose, Public API, a scenario, an error row,
  files), `cli.spec.md` (Purpose, `llmDoctorCheck` row, error rows),
  `discord.spec.md` and `watch.spec.md` (Public API), and each module's
  `testing.md`.
- No CHANGELOG / STATUS / package.json edit (the release PR writes them).
