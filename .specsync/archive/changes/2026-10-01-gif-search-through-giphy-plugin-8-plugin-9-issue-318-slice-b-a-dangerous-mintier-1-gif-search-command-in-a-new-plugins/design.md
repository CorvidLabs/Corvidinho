---
change: gif-search-through-giphy-plugin-8-plugin-9-issue-318-slice-b-a-dangerous-mintier-1-gif-search-command-in-a-new-plugins
artifact: design
---

# Design

- `plugins/gif/giphy.ts` (new, REQ-plugins-3182): constants (`GIPHY_API_KEY_ENV`,
  `GIPHY_API_HOST`, `GIPHY_SEARCH_PATH` `/v2/search`, `GIPHY_CONTENT_FILTER`
  `medium`, `GIPHY_ALLOWED_RATINGS`, `GIPHY_MEDIA_FILTER`, `GIPHY_CLIENT_KEY`,
  `GIPHY_MEDIA_HOSTS`, `GIPHY_ATTRIBUTION` "Powered By GIPHY",
  `GIF_POST_GUIDANCE`, `GIPHY_SEARCH_COST_MICRO_USD` 0,
  `GIPHY_SEARCH_SPEND_MODEL`, the limit / query caps), `parseGifSearchArgs`,
  `giphySearchUrl` (built from scratch with `searchParams.set`, so query text
  is only ever `q` and `contentfilter` is always `medium`),
  `giphyMediaUrl` (https, no credentials, default port, exact media host,
  path and query of plain URL characters only so a pasted link cannot
  become Discord markdown, fragment dropped), `giphyHits` (GIPHY's order,
  link validation only, returns the hits and a `dropped` count; `api-error`
  / `bad-response` without a results list), `giphyGifSearch` (key, args,
  SAFE-6 query check, stopped-run check, `reserveFlatSpend` at 0,
  `apiGetJson`, settle, error map), `formatGifHits`, `fenceGifResults`,
  `GifSearchError` (carries the spend-cap ask).
- The key is a URL query parameter (GIPHY takes no key header). The keyed
  JSON GET never returns or echoes its URL, and every string `gif-search`
  returns goes through `scrubOut` (`redactSecretEnvValues` +
  `scrubSecrets`, reused from `plugins/web/search.ts`) as its last step,
  so even GIPHY echoing the URL comes back as `key=[redacted:env-secret]`
  inside the fence. The key shape (8-128 of `[A-Za-z0-9_-]`) keeps it at or
  above the 8-character floor of the by-name redaction.
- `plugins/gif/hosts.ts` (new, no imports): `GIPHY_MEDIA_HOSTS` and
  `hasGiphyMediaLink`, re-exported by `giphy.ts`.
- `plugins/gif/commands.ts`: the `gif-search` command (dangerous, minTier 1,
  no `mustAsk`, AUTONOMY-11), a short description that says to use it only
  when someone asks and to post one as a link (FLEDGE-5, PLUGIN-8), output
  shape (`postAs: "link"`, `dropped`, attribution, the guidance and a
  left-out line in the summary), exit codes; `createGifCommands` takes the
  resolver / transport / env / ledger seams. `plugins/gif/index.ts`:
  `loadGifPlugins`.
- `plugins/web/search.ts`: `parseWebSearchArgs` refuses `--query`, `--count`
  or `--freshness` given twice, as `parseGifSearchArgs` does for `--query`
  and `--limit`.
- `src/discord/rich-reply.ts`: `readsBetterAsEmbed` is false when the text
  holds a GIPHY media link (`hasGiphyMediaLink`), so a GIF link stays in
  message content, where Discord unfurls it (REQ-discord-075).
- `src/plugins/builtins.ts`: `loadGifPlugins()` after the web plugins.
- `src/plugins/roles.ts`: `TEAM_SEARCH_TOOLS` gains `gif-search`.
- `src/agent/untrusted.ts`: `gif-search` in `INJECTION_SCAN_TOOLS` and in
  the tool-call payload names; `src/agent/loop-guards.ts`: in
  `NO_STATE_CHANGE_TOOLS`.
- Key lists: `WORKER_ENV_DROP` (`src/autonomous/delegate.ts`, so also the
  verify lane, shell and runners), Fledge `DROP_KEYS`
  (`plugins/fledge/spawn.ts`), `SECRET_ENV_NAMES` (`src/store/scrub.ts`),
  `tests/preload.ts`.
- Tool-surface budget (FLEDGE-5 / PLUGIN-6): `TOOL_SURFACE_BUDGET_TOKENS`
  stays 8000. `gif-search` costs about 92 tokens (about 65 of them the shared
  tool schema), which took every builtin plus the test's Fledge plugin to
  8070 with the old descriptions. The `web-fetch` and `web-search`
  descriptions (`plugins/web/commands.ts`) say the same rules in fewer words
  (no internal SAFE-7 mechanics, no key name, no CLI-only `--url` / `--json`
  forms), bringing the total to 7991.
- SAFE-8: `reserveFlatSpend` with 0 writes a `reserved` $0 row before the
  request and settles it at $0; `spent + 0 > cap` stops it only when the
  window is already past the cap, with the same spend-cap ask. No schema
  change.
- Comments only: `src/agent/execute.ts`, `src/agent/spend.ts`,
  `src/plugins/types.ts`, `plugins/web/api.ts` name `gif-search`.
