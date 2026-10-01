---
change: prefer-fledge-gif-giphy-tenor-compat-over-native-gif-search-for-discord-gifs-pass-giphy-api-key-to-fledge-children-keep
artifact: testing
---

# Testing

- `bun test tests/gif.search.test.ts` — Fledge child env now keeps `GIPHY_API_KEY`; docs name `fledge-gif`; gif-search description secondary.
- `bun test tests/fledge.plugins.test.ts` — regression for discovery/SAFE-1.
- Live: `fledge gif search "thumbs up"` with `GIPHY_API_KEY` set; Discord ask for a GIF after allowlist + code tier.
