---
change: rolling-24-hour-spend-caps-per-provider-plus-the-total-cap-each-warning-the-owner-at-80-and-stopping-to-ask-at-100-safe
artifact: docs
---

# Docs

- `.env.example`: the total cap text says "the total cap" and "each cap";
  new `CORVIDINHO_PROVIDER_SPEND_CAPS_USD` block (provider=USD keyed on the
  endpoint host, each cap warns and stops on its own, every cap optional, a
  bad entry or unknown provider stops every call, no fallback around a cap).
- `src/cli.ts` `--help`: the new variable.
- `docs/discord.md`: the SAFE-14.a paragraph names both settings, says the DM
  names which cap, each cap has its own warning and episode, and the owner's
  `/status` has a line per provider cap.
- `docs/DISCORD-GO-LIVE.md` E.1: the spend bullet names both settings and
  per-cap warnings / pings.
- `docs/DAEMON.md`: `spend.warning` names both caps (a provider cap's message
  names its scope); kept #325's `llm.fallback` row.
- `docs/BOX-UPDATE.md`: `/status` shows spend vs each cap.
- `specs/agent/agent.spec.md` (files list, per-provider paragraph, invariant,
  behaviour table), `specs/cli/cli.spec.md` (doctor and preload paragraphs),
  `specs/discord/discord.spec.md` (ping key, `/status`, DM, `askPingOwner`,
  `spend_alerts` invariant) and the three `testing.md` files; requirements via
  the deltas.
- README and STATUS say nothing this makes false; no CHANGELOG or version
  edits; no hi edits (SAFE-14 / SAFE-15 are already captured).
