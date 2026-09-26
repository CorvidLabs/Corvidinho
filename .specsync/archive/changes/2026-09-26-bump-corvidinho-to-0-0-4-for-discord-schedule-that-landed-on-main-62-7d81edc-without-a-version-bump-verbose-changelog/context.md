---
change: bump-corvidinho-to-0-0-4-for-discord-schedule-that-landed-on-main-62-7d81edc-without-a-version-bump-verbose-changelog
artifact: context
---

# Context

`/schedule` shipped on main via #62 (`7d81edc`) after the v0.0.3 tag; package.json and Discord presence (via `src/version.ts` → `package.json`) still say 0.0.3. CHANGELOG incorrectly nested `/schedule` under 0.0.3. SESSION durable (#61) also landed after v0.0.3 without a release callout. Ops will restart the Discord bridge after this cut — do not invent features or restart the bridge here.
