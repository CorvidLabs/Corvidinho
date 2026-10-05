---
change: prefer-fledge-gif-giphy-tenor-compat-over-native-gif-search-for-discord-gifs-pass-giphy-api-key-to-fledge-children-keep
artifact: plan
---

# Plan

1. Ship `fledge-plugin-gif` v0.2 (GIPHY Tenor-compat + env key) on the box.
2. Pass `GIPHY_API_KEY` through Fledge child env; update tests.
3. Prefer language in docs / gif-search description / persona; keep gif-search.
4. Allowlist `fledge-gif` and set `CORVIDINHO_LLM_TIER=code` on the live box; restart after merge.
