---
change: gif-search-through-giphy-plugin-8-plugin-9-issue-318-slice-b-a-dangerous-mintier-1-gif-search-command-in-a-new-plugins
artifact: tasks
---

# Tasks

- [x] HI: PLUGIN-8 captured verbatim (`hi`), INTENT.md index.
- [x] Provider research and choice (GIPHY Tenor-compatible `/v2/search`, `contentfilter=medium`).
- [x] `plugins/gif/giphy.ts`, `plugins/gif/commands.ts`, `plugins/gif/index.ts`; `loadGifPlugins` in `loadBuiltins`.
- [x] `TEAM_SEARCH_TOOLS` gains `gif-search` (`src/plugins/roles.ts`).
- [x] `INJECTION_SCAN_TOOLS`, tool-call payload names, `NO_STATE_CHANGE_TOOLS`.
- [x] SAFE-8: `reserveFlatSpend` at 0 (a $0 row).
- [x] Key lists: `WORKER_ENV_DROP`, Fledge `DROP_KEYS`, `SECRET_ENV_NAMES`, `tests/preload.ts`.
- [x] Tool-surface budget kept at 8000: shorter `web-fetch` / `web-search` descriptions (`plugins/web/commands.ts`).
- [x] Review fixes: media links limited to plain URL characters (fragment dropped); left-out results counted (`data.dropped`, summary); "only when someone asks" in the description and guidance; `--query` / `--limit` (and web-search's `--query` / `--count` / `--freshness`) given twice refused; a GIPHY link never put in an embed (`src/discord/rich-reply.ts`); 422, too-large, network, invalid-cap and 2xx-settle tests.
- [x] Tests: `tests/gif.search.test.ts` (new); `tests/roles.team.test.ts`, `tests/web.search.test.ts`, `tests/preload.operator-data-dir.test.ts` + probe updated.
- [x] Docs: `.env.example`, `docs/DISCORD-GO-LIVE.md`, `docs/discord.md`.
- [x] Spec: deltas, `plugins.spec.md` / `agent.spec.md` prose and files, testing companions.
- [x] Fail-on-main proof against PR A's head d768396; `hi check`; `specsync check --require-coverage 100`.

## Not done yet (outside this branch's code)

- `bun test` and the fledge verify lane green on Linux CI or the VPS. On
  macOS only the Linux-only failures remain (names in testing.md).
- Leif's go on #318 for the definitions (PR A's first). Then PR A's change
  approved, checked and finalized; then this change's approval (actor
  corvid-agent, citing the go), `specsync change check --commit`, scoped
  review and finalize. Until then Spec Sync CI (`specsync change audit`)
  stays red.
- Leif's decision on showing "Powered By GIPHY" in the reply people see.
- A live smoke with a real GIPHY key: one search, a posted link that Discord
  unfurls beside the footer embed, its host on `GIPHY_MEDIA_HOSTS`, and a $0
  ledger row with a spend cap set.
