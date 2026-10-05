---
change: prefer-fledge-gif-giphy-tenor-compat-over-native-gif-search-for-discord-gifs-pass-giphy-api-key-to-fledge-children-keep
artifact: lesson-bundle
---

# Lessons

- Tenor API shut down 2026-06-30; fledge-plugin-gif must use GIPHY Tenor-compat + GIPHY_API_KEY.
- Preferring fledge-gif requires passing GIPHY_API_KEY through fledgeChildEnv (workers/verify still drop it).
- Squash-merge orphans SpecSync finalize; tip-orphan archive like #355.
