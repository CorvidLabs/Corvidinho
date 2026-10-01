---
change: prefer-fledge-gif-giphy-tenor-compat-over-native-gif-search-for-discord-gifs-pass-giphy-api-key-to-fledge-children-keep
artifact: context
---

# Context

Leif chose prefer `fledge-plugin-gif` (Tenor path) over native GIPHY `gif-search` for Discord “show me a gif”. Tip already shipped #331 `gif-search`. Tenor’s public API discontinued 2026-06-30; `fledge-plugin-gif` v0.2+ uses GIPHY Tenor-compat (`api.giphy.com/v2`) with `GIPHY_API_KEY`. Corvidinho’s `fledgeChildEnv` previously dropped that key, so discovered `fledge-gif` could never search. No new PLUGIN HI — wiring, docs, and prefer-path only; keep `gif-search` for team/tool-tier.
