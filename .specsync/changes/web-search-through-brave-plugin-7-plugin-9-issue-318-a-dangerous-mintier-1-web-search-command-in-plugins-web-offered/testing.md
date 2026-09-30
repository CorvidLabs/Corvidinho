---
change: web-search-through-brave-plugin-7-plugin-9-issue-318-a-dangerous-mintier-1-web-search-command-in-plugins-web-offered
artifact: testing
---

# Testing

New `tests/web.search.test.ts` (no network: fake resolver, fake transport
answering like Brave, fake key `test-key-not-real`, in-memory ledger DBs):

- Registration and gating: dangerous / minTier 1; catalog only when
  allowlisted, never at read tier; owner, null and team offered, community
  never, team still without web-fetch; `TEAM_SEARCH_TOOLS` is `web-search`;
  SAFE-1 deny with a `denied` row and SAFE-5 `started` / outcome rows; a
  community role session refused, a team one reaches the handler.
- Request: host, path, `q` / `count` / `safesearch=moderate` / `freshness`,
  key header only, pinned address; usage errors (counts 0, 21, 5.5, abc, -3,
  1e1, missing; bad freshness; unknown flag; missing, blank, 401-char,
  51-word query; query words together with `--query`; a `--verbose` term
  outside `--query`) send nothing, and the usage line says a `--` term needs
  `--query`; no / blank / malformed key → not-configured, the error starting
  `web-search not-configured: web search is not configured`; secret-carrying
  queries (also the key split by a joiner) refused before anything is sent.
- Output: hostile hits only inside the fence (unique end marker, HTML /
  entity / control reduction, attribution in the summary), count cap,
  dropped non-http URLs, `(no results)`.
- SAFE-13 through `createTaskExecute`: an injected description notes the
  message and drops `web-search`, `web-fetch` and `files-write`; the write is
  refused; one notice; summary note.
- SAFE-6: the key echoed by results, error bodies, a non-JSON body, a
  transport error or a DNS error never comes back; the key split by a
  zero-width space, a soft hyphen, a bidi isolate, a tag character or BEL in
  a title, URL, description and age (json and text mode), in a resolver
  answer a SAFE-7 refusal names, or straight into `fenceSearchResults`, never
  comes back whole (the scrub is the last step); through `runPlugin` the
  result and audit rows carry neither the key, the path, the header name nor
  the pinned address; env drop lists and `formatErrorLine`.
- Keyed JSON GET: scheme / host / port / credentials refused before DNS;
  non-public answers refused before connecting; every redirect refused;
  content type, encoding, size, JSON validity, timeout, abort (the
  transport's own signal aborted on the deadline and on the caller's abort);
  a body that fails mid-read is `network`; 401 / 403 / 422 / 429 / 503
  mapping; the run's abort through the handler ends a pending search
  `aborted` and aborts the transport's signal, and a run already stopped
  sends nothing; an unexpected failure is one fixed line; web-fetch unchanged
  for any public host.
- SAFE-8: no cap opens no DB; reserve-before-request and settle (actual;
  failed on HTTP error / pre-connect refusal; estimated on network failure,
  timeout, non-JSON or malformed 2xx body and an abort after sending; no row
  for a run already stopped); at the cap, with an invalid cap and with an
  unavailable ledger (a closed DB: the ask says the spend ledger is
  unavailable) nothing is sent and the ask rides `spendAsk`; in the tool loop
  the attempt ends with `SPEND_CAP_SUMMARY` and the ask after one model call.
- The two `createTaskExecute` tests configure `CORVIDINHO_LLM_MODEL:
  "test-model"` (AGENT-13 on main: no built-in default model).

Updated: `tests/web.fetch.test.ts` (web-search now exists),
`tests/roles.team.test.ts` (team search rule, team catalog),
`tests/preload.operator-data-dir.test.ts` and `tests/fixtures/preload-probe.ts`
(a child `bun test` never sees `BRAVE_SEARCH_API_KEY`).

## Fail on main

Recorded below under Results (main 507d97b).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-318` | `tests/web.search.test.ts` | Registration (dangerous, minTier 1), catalog only when allowlisted and never at read tier, SAFE-1 deny + SAFE-5 rows, role gate at `runPlugin`; the Brave request (host, path, `q` / `count` / `safesearch=moderate` / `freshness`, key only in `X-Subscription-Token`, pinned address); usage errors, `not-configured`, SAFE-6 query refusal with nothing sent; fenced hostile hits, count cap, dropped URLs, `(no results)`; the key and the request URL never in any result, error or audit row; Brave error mapping. Fails on the base source. |
| `REQ-plugins-3181` | `tests/web.search.test.ts` | http / other host / port / credentials refused before DNS; non-public answers refused before connecting; every redirect refused after one dial, Location not echoed; content type, encoding, byte cap, JSON validity, timeout, abort; network / TLS / DNS failures name the host and a fixed reason only; web-fetch unchanged for any public host. New module (cannot load on main). |
| `REQ-plugins-111` | `tests/web.fetch.test.ts`, `tests/web.search.test.ts` | "registered as a typed builtin" now expects `web-search` to exist as its own command; web-fetch keeps its fixed headers for any public host and every other web-fetch test passes unchanged. Fails on the base source. |
| `REQ-plugins-065` | `tests/roles.team.test.ts`, `tests/web.search.test.ts` | `roleAllowsPlugin` over every plugin with `TEAM_SEARCH_TOOLS` (`web-search` only); the team catalog offers `web-search` (allowlisted) and not `web-fetch`, community never; a community role session is refused at `runPlugin`, a team one reaches the handler. Fails on the base source. |
| `REQ-plugins-113` | `tests/web.search.test.ts` | `fledgeChildEnv` drops `BRAVE_SEARCH_API_KEY` and keeps `PATH`. Fails on the base source. |
| `REQ-agent-002` | `tests/web.search.test.ts`, `tests/agent.verify-env.test.ts` | `isVerifyEnvDropped` / `buildVerifyEnv` drop `BRAVE_SEARCH_API_KEY`; the existing verify-env tests pass unchanged. Fails on the base source. |
| `REQ-agent-117` | `tests/web.search.test.ts`, `tests/autonomous.delegate.test.ts` | `isWorkerEnvDropped` and `buildDelegateSpawn` drop `BRAVE_SEARCH_API_KEY` (no value anywhere in the spawn); existing delegate env tests pass. Fails on the base source. |
| `REQ-agent-071` | `tests/web.search.test.ts`, `tests/safe.injection.test.ts` | `web-search` is in `INJECTION_SCAN_TOOLS`; through `createTaskExecute` an injected description notes the tool message, drops `web-search`, `web-fetch` and `files-write` from the next request, refuses the write, reports one notice and ends the summary with the note; the existing SAFE-13 tests pass. Fails on the base source. |
| `REQ-agent-086` | `tests/agent.loop-guards.test.ts` | Every dangerous or mutating builtin, `web-search` included, is in exactly one of `STATE_CHANGING_TOOLS` / `NO_STATE_CHANGE_TOOLS` (`web-search` in the second). Fails on the base source's sets once `web-search` is registered. |
| `REQ-agent-098` | `tests/web.search.test.ts`, `tests/agent.spend-ask.test.ts`, `tests/agent.spend.test.ts` | No cap opens no DB; reserve 5000 micro-USD before the request, settle `actual` / `failed` 0 / `estimated`; at the cap and with an invalid value nothing is sent and `spendAsk` carries the ask; in the tool loop the attempt ends with `SPEND_CAP_SUMMARY` and the ask after one model call; the existing spend tests pass. Fails on the base source. |
| `REQ-discord-417` | `tests/web.search.test.ts` | `redactSecretEnvValues` and `formatErrorLine` redact the `BRAVE_SEARCH_API_KEY` value. Fails on the base source. |
| `REQ-cli-262` | `tests/preload.operator-data-dir.test.ts` | A child `bun test` started with `BRAVE_SEARCH_API_KEY` set sees none of the run settings (the probe lists the key). Fails on the base source. |
