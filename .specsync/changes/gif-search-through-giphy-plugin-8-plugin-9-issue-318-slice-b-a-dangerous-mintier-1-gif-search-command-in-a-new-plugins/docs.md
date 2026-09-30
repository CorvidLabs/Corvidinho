---
change: gif-search-through-giphy-plugin-8-plugin-9-issue-318-slice-b-a-dangerous-mintier-1-gif-search-command-in-a-new-plugins
artifact: docs
---

# Docs

- `.env.example`: a `GIPHY_API_KEY` block (env only, no default, key in the
  URL never shown, off until allowlisted, owner and team only,
  `contentfilter=medium` G and PG, link only, $0 against the cap, beta-key
  rate limit, "Powered By GIPHY", never passed to workers / verify / shell /
  runners / Fledge); the `CORVIDINHO_ALLOWLIST` note says team also gets
  `gif-search`.
- `docs/DISCORD-GO-LIVE.md`: E.3 table row for `gif-search`; the E.3 intro
  and the "What an entry unlocks" role bullet name it for team; new E.3.b
  (turn it on, the not-configured error, what one search does: the endpoint
  and the fixed filter, the key in the URL never shown, SAFE-7, media-host
  validation, SAFE-13, link-only posting and the must-ask note, SAFE-8 at
  $0, SAFE-5, "Powered By GIPHY" and the open question on reply
  attribution); a note that `fledge-plugin-gif` is not a working path (Tenor
  is shut down; it ships a hardcoded key its owner should revoke) — the key
  itself is not quoted; the E.6 team bullet and community catalog name it.
- `docs/discord.md`: the Team role bullet names `gif-search` (link only,
  never attached; `discord-send-file` stays the owner's); the SAFE-13 tool
  list names `gif-search`.
- `specs/plugins/plugins.spec.md`, `specs/agent/agent.spec.md`: files list,
  public API, invariants, a scenario, error rows, dependencies; testing
  companions for plugins, agent, discord and cli. Requirements through the
  deltas. No CHANGELOG / STATUS / version edits (a release does those).
