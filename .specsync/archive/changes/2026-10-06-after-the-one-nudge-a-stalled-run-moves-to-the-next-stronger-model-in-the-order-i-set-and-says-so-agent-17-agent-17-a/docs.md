---
change: after-the-one-nudge-a-stalled-run-moves-to-the-next-stronger-model-in-the-order-i-set-and-says-so-agent-17-agent-17-a
artifact: docs
---

# Docs

- `src/cli.ts` `--help`: `CORVIDINHO_LLM_MODEL_ORDER` line under the model
  keys.
- `.env.example`: the optional order with what it does, an example, and
  "unset = no order: the one nudge still happens, then the reply stands".
- `README.md`: one sentence next to the model list.
- `docs/discord.md`: the AGENT-17 paragraph no longer says moving to a
  stronger model is not built; it describes the move, the closing line, the
  stay cases and that the order is the only setting.
- `docs/DISCORD-GO-LIVE.md`: E.9 "Model order (AGENT-17 / AGENT-17.a)"
  paragraph and the env block line.
- Specs: agent (purpose, public API, invariants, scenario, error cases,
  files list, testing) and cli (invariant, testing).
- No STATUS / CHANGELOG version section and no package.json bump (release
  PRs own those).
