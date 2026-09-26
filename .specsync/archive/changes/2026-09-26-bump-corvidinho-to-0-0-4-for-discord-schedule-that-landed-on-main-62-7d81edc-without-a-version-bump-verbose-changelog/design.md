---
change: bump-corvidinho-to-0-0-4-for-discord-schedule-that-landed-on-main-62-7d81edc-without-a-version-bump-verbose-changelog
artifact: design
---

# Design

Single source of truth remains `package.json` → `src/version.ts` (`VERSION`, `formatPresenceVersionString`) → Discord Custom Status (`src/discord/presence.ts`). No hardcoded bridge version constant. Release via existing `.github/workflows/release.yml` on annotated `v*` tag push.
