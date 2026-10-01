---
change: prefer-fledge-gif-giphy-tenor-compat-over-native-gif-search-for-discord-gifs-pass-giphy-api-key-to-fledge-children-keep
artifact: design
---

# Design

- Stop dropping `GIPHY_API_KEY` from `fledgeChildEnv` so PLUGIN-3 `fledge-gif` can use the bridge key; workers/verify/shell still drop it.
- Prefer-oriented `fledgeDescription` when command is `gif`; de-emphasize `gif-search` tool description and docs E.3.b.
- `fledge-gif` stays native/minTier 2 (code tier); `gif-search` stays minTier 1 for team/tool-tier.
- Scrub/preload recognize `TENOR_API_KEY` as alias (still dropped from workers).
