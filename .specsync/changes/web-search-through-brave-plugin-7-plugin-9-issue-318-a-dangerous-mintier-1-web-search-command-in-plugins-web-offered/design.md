---
change: web-search-through-brave-plugin-7-plugin-9-issue-318-a-dangerous-mintier-1-web-search-command-in-plugins-web-offered
artifact: design
---

# Design

- `plugins/web/fetch.ts`: `pinTargets`, `dialPinned` (now taking the
  transport and the headers; web-fetch passes `REQUEST_HEADERS`),
  `readCapped` and `mediaType` exported; web-fetch behaviour unchanged.
- `plugins/web/api.ts` (new, REQ-plugins-3181): `apiGetJson(req, deps)`,
  `checkApiUrl`, `ApiRequestError` (`code`, numeric `status`, parsed
  `errorBody`), `API_NOT_SENT_CODES`, `API_MAX_BYTES`, `API_TIMEOUT_MS`,
  `API_REQUEST_HEADERS`. The reusable path for PR B (`gif-search`, allowed
  host `api.giphy.com`).
- `plugins/web/search.ts` (new, REQ-plugins-318): constants (env name, host,
  path, safesearch, 5000 micro-USD, attribution, count / query limits),
  `parseWebSearchArgs`, `braveSearchUrl`, `braveHits`, `braveWebSearch`
  (key, args, SAFE-6 query check, `reserveFlatSpend`, `apiGetJson`, settle,
  error map), `formatHits`, `fenceSearchResults`, `scrubOut`
  (`redactSecretEnvValues` + `scrubSecrets`), `WebSearchError` (carries the
  spend-cap ask).
- Secret scrub last: titles, descriptions, ages and the query drop control
  and invisible characters (`stripInvisible`) before anything else sees them;
  `fenceSearchResults` scrubs the fenced string after the fence, and the
  handler's error line is normalised, then scrubbed, then capped
  (`clipSearchError`), so no later transform can rebuild a split key. The
  SAFE-6 query check also runs on the query with every format character
  (a joiner) taken out.
- A run already stopped (its abort signal set) ends `aborted` before the
  reservation: no ledger row, no DNS, no request. An abort after the request
  went out keeps the estimate (it may have been billed).
- An unexpected failure is one fixed line (`web-search unexpected: the search
  failed unexpectedly`), never the error's own text.
- `plugins/web/commands.ts`: the `web-search` command (dangerous, minTier 1,
  no must-ask entry per AUTONOMY-11), output shape and exit codes;
  `createWebCommands` takes the search seams (`env`, `spendDb`, `now`).
- `src/plugins/roles.ts`: `TEAM_SEARCH_TOOLS` in `roleAllowsPlugin` for team.
- `src/plugins/types.ts`: `PluginHandlerResult.spendAsk?: HumanAsk`.
- `src/agent/spend.ts`: `reserveFlatSpend` / `FlatSpendHold` /
  `FlatSpendOutcome` on the existing `SpendLedger` (no schema change).
- `src/agent/execute.ts`: an offered tool's `spend-cap` `spendAsk` ends the
  attempt with `SPEND_CAP_SUMMARY` and the ask.
- `src/agent/untrusted.ts`: `web-search` in `INJECTION_SCAN_TOOLS` and in the
  tool-call payload names; `src/agent/loop-guards.ts`: in
  `NO_STATE_CHANGE_TOOLS`.
- Key lists: `WORKER_ENV_DROP`, Fledge `DROP_KEYS`, `SECRET_ENV_NAMES`,
  `tests/preload.ts`.
- GIPHY (PR B) will be free-tier: the same `reserveFlatSpend` can record a $0
  row or skip it; that choice is PR B's.
