---
module: plugins
change:
gif-search-through-giphy-plugin-8-plugin-9-issue-318-slice-b-a-dangerous-mintier-1-gif-search-command-in-a-new-plugins
---

# Delta: plugins (gif-search through GIPHY, PLUGIN-8 / PLUGIN-9, #318 slice B)

## Added

### REQUIREMENT REQ-plugins-3182

The plugin host SHALL provide a typed `gif-search` builtin (PLUGIN-8, #318
slice B) registered from a new `plugins/gif` (`loadGifPlugins`,
`createGifCommands`, loaded by `loadBuiltins` after the web plugins) and
declared `dangerous: true` and `minTier: 1` (PLUGIN-2): being dangerous it
SHALL need SAFE-1 consent (left out of the default tool catalog, offered and
run non-interactively only when `CORVIDINHO_ALLOWLIST` names it, never at the
read tier) and every run SHALL be audited (SAFE-5, through `runPlugin`). It
SHALL be for the owner and the team only (PLUGIN-9, REQ-plugins-065
`TEAM_SEARCH_TOOLS`), never community, WATCH or schedules; `delegate` /
`council` workers never get the key (REQ-agent-117). It never posts, so it
carries no `mustAsk` entry (AUTONOMY-11); it SHALL NOT download a GIF or hand
one to `discord-send-file`: a run shares a GIF as a link in its own reply
(PLUGIN-8, GIPHY's terms against caching or re-hosting), and a
`discord-post-message` a GIF run makes still goes through that tool's gate.
Its handler SHALL, in order: read the key from `GIPHY_API_KEY` in the run's
env only, trimmed, with no default — unset or blank, or not 8–128 letters,
digits, `_` or `-`, SHALL be `ok: false`, exit 1, `data.code`
`not-configured` and an error that starts `gif-search not-configured: GIF
search is not configured` and names `GIPHY_API_KEY` (never a silent empty
result, never the value), with no DNS, request or spend; parse
`<query words…> | --query <text> [--limit N] [--json]`, where the query
(words joined by one space, control and invisible characters removed,
trimmed) is 1–50 characters (GIPHY's limit), `--limit` is a whole number
(digits only) from 1 to 10 (default 5), and any other `--flag` — `--rating`
and `--contentfilter` among them — is refused, so the filter can never be
changed and a term that starts with `--` goes in `--query`; query words and
`--query` together, or `--query` / `--limit` given twice, are refused (never
a silently dropped part of the request) — a usage error is exit 1,
`data.code` `usage`, nothing sent; refuse (exit 2, `data.code` `secret`, SAFE-6) a query
that carries a value `scrubSecrets` would redact or the value of a set secret
env var (`redactSecretEnvValues`, this key included), also once every format
character is taken out, before any spend or request; end a run that is
already stopped as `aborted` (exit 1) with no reservation and nothing sent;
reserve its price against the SAFE-8 cap (REQ-agent-098 `reserveFlatSpend`,
`GIPHY_SEARCH_COST_MICRO_USD` 0 — GIPHY's API is free-tier, so the row is
recorded at $0 —, provider `api.giphy.com`, model `giphy-gif-search`) — a
stopped reservation SHALL be `ok: false`, exit 2, `data.code` `spend-cap`,
the error `gif-search spend-cap: refused: Work is paused for budget.
(SAFE-8)` and the spend-cap ask in `PluginHandlerResult.spendAsk`, with
nothing sent; then send one `GET https://api.giphy.com/v2/search` (GIPHY's
Tenor-compatible search, whose `contentfilter=medium` GIPHY documents as G
and PG) whose query string is built from scratch with `q`, `key` (the key),
`client_key=corvidinho`, `limit`, `media_filter=gif,tinygif` and
`contentfilter=medium` (always; query text is only ever the `q` value and can
add or change no parameter), through the keyed JSON GET (REQ-plugins-3181)
with `api.giphy.com` as the only allowed host, no header beyond the fixed API
headers, and the run's abort signal. The reservation SHALL settle as `billed`
on a 2xx, `not-billed` on an HTTP error reply or a refusal before
connecting, and `unknown` on any other failure (every outcome is $0).
A 401 / 403 SHALL be `auth` (naming `GIPHY_API_KEY`); 400 / 422
`bad-request`; 429 `rate-limited`; any other status `http-status` with the
numeric status only. A 2xx body without a `results` array SHALL be
`api-error` when it has an `error` field (GIPHY's Tenor-compatible layer
answers some errors with HTTP 200) and `bad-response` otherwise — GIPHY's
text is never shown. Any other failure SHALL be the fixed line `gif-search
unexpected: the GIF search failed unexpectedly` (exit 1), never the error's
own text. Refusals (`secret`, `spend-cap`, `scheme`, `host`, `blocked`,
`redirect`) SHALL exit 2 and other failures exit 1, each with `data.code`
and one line of at most 300 characters: controls and invisible characters
normalised first, then scrubbed, then capped.
On success the hits SHALL be GIPHY's `results[]` entries in GIPHY's order, at
most `limit`: the title reduced from HTML to one line of plain text
(entities decoded; tags, control and invisible characters removed; capped at
200 characters; `(untitled)` when empty) and the `media_formats.gif.url` and
`media_formats.tinygif.url` links, each kept only when it parses as an https
URL without credentials, on the default port, whose host is exactly one of
`GIPHY_MEDIA_HOSTS` (`plugins/gif/hosts.ts`: `media.giphy.com`,
`media0.giphy.com` to `media4.giphy.com`, `i.giphy.com`; no suffix match, no
trailing dot), whose path holds only letters, digits, `.`, `_`, `~`, `%`, `/`
and `-` and whose query only letters, digits, `.`, `_`, `~`, `%`, `-`, `=`
and `&` (so a link the run pastes cannot become Discord markdown such as a
masked link to another host or a mention), of at most 2048 characters, with
any fragment dropped. A result with neither link (or that is not an object)
SHALL be dropped and counted; nothing else is filtered or reordered, and
GIPHY's page URLs (`url`, `itemurl`) are not returned. Every title and link SHALL reach the model only inside the
untrusted web fence (`fenceUntrusted`, source `giphy-search`, a per-call
random marker id): the fenced body lists the results numbered (title, `GIF:`
and `Small GIF:` lines) or `(no results)`. `data` SHALL be `{ provider:
"giphy", attribution: "Powered By GIPHY", contentfilter: "medium", limit,
results, dropped, postAs: "link", untrusted: true, content }` (`dropped`: the
results left out for their links), and the summary `gif-search: <n> GIF(s)
from GIPHY (contentfilter medium: rated G and PG).[ <k> result(s) left out:
no link on a GIPHY media host.] Only when someone asks for a GIF, post one
as a link in your reply (Discord shows it from GIPHY); never download or
attach it. Powered By GIPHY.` (the bracketed part only when `dropped` is
above 0, so a search whose every result was left out never reads like a
real empty one; `--json` / json mode: the summary alone; otherwise followed
by the fenced content). The command's description SHALL say to use it only
when someone asks and to post one as a link (PLUGIN-8, "post it as a link
when asked"). The SAFE-13 detector SHALL
scan the result (REQ-agent-071). No output, error, data field or audit row
SHALL carry the key, the request URL (its query holds the key), the pinned
address or GIPHY's text outside the fence: every returned string SHALL pass
`scrubSecrets` and `redactSecretEnvValues` (`GIPHY_API_KEY` is a SAFE-6
secret env name, REQ-discord-417) as its last step, after the fence and any
control or invisible-character strip. No table, column or schema version;
one new env var, `GIPHY_API_KEY` (documented in `.env.example` and
`docs/DISCORD-GO-LIVE.md` E.3.b, which also carry "Powered By GIPHY").

Acceptance Criteria
- `plugins list` shows `gif-search` with dangerous=true, minTier=1, no must-ask entry and a description that says `only when someone asks` and `post one as a link`; it is in `NO_STATE_CHANGE_TOOLS`; the catalog offers it at tool/code tier only when the allowlist names it, never at read tier; a non-interactive run without the allowlist entry is denied (SAFE-1) with a `denied` audit row, and an allowlisted run records `started` then its outcome (SAFE-5).
- The owner, no role session and team (chat and `/work`) are offered it when allowlisted; community never is; team still gets neither `web-fetch` nor `discord-send-file`; a community role session's `runPlugin gif-search` gets the role refusal while a team one reaches the handler.
- With a fake key, exactly one request goes out, to the pinned address of `api.giphy.com` at `/v2/search`, with exactly `q`, `key`, `client_key=corvidinho`, `limit=5`, `media_filter=gif,tinygif` and `contentfilter=medium`, and only the fixed API headers (no key header); no GIF is downloaded.
- A query of `cats&contentfilter=off&rating=r` (and similar) is sent as the `q` value only, with one `contentfilter=medium`, one `key` and no `rating` parameter.
- `--contentfilter off`, `--rating r`, `--media-filter mp4`, `--download`, a limit of 0, 11, 2.5, -1 or a missing one, query words together with `--query`, `--query` or `--limit` given twice (`--query "cute cat" --query dog` is `--query given twice`, never `dog` alone), and a missing, blank or 51-character query are usage errors (exit 1) with no DNS or request; the usage line says the safety filter is fixed at medium.
- No key, a blank key, a key with a space and a 5-character key give the `not-configured` error, starting `gif-search not-configured: GIF search is not configured` and naming `GIPHY_API_KEY`, with no DNS and no request, never an empty success.
- A query carrying a `ghp_…` token, a set secret env value (Discord, Brave) or the GIPHY key (also split by a joiner) is refused with exit 2 before DNS, request or spend, and the value is not echoed.
- Titles and links appear only inside the fence in GIPHY's order (a hostile title, a guessed end marker and control characters included); the end marker is unique and last; HTML and entities are reduced; nothing of a result appears outside the fence; `data` and the summary carry `Powered By GIPHY`, `postAs: "link"`, `dropped: 0` and the guidance to post one only when someone asks, as a link.
- Links over http, off the GIPHY media hosts (look-alike and suffix hosts, `giphy.com` page URLs, `media5`), with credentials, on port 8443, with a trailing-dot host, over 2048 characters, or with Discord markdown or a mention after the host (`)[click](https://evil.example)` in the path or query, `<@…>`, `<@&…>`, `**`, `|`, `@everyone`) are dropped; a fragment is cut off (`#@everyone` never passes); GIPHY's own `/media/v1.…/giphy.gif?cid=…&rid=giphy.gif&ct=g` links pass whole; a result with only a valid `tinygif` keeps only its `Small GIF:` line; a result with no valid link is dropped and counted in `data.dropped` and the summary; the rest keep GIPHY's order up to `--limit`.
- Results that all fail the link check are an ok `(no results)` with `results: 0`, `dropped: k` and the summary line `k result(s) left out: no link on a GIPHY media host.`; a real empty search has `dropped: 0` and no such line.
- No results is an ok `(no results)`; a 2xx `{ error: … }` body is `api-error` and a 2xx body without `results` is `bad-response`, neither showing GIPHY's text.
- A server echoing the key or the request URL in titles, links, a 401 body, a 500 body, a 2xx error body, a non-JSON body, a redirect Location, a transport error or a DNS error: nothing returned (json or text mode) contains the key or the request's query string, and no error carries the path, `key=` or the Location; GIPHY's own echo inside the fence shows `key=[redacted:env-secret]`.
- The key split by a zero-width space, a soft hyphen, a bidi isolate, a tag character or BEL in a title or link (json and text mode), in a resolver answer a SAFE-7 refusal names, or straight into `fenceGifResults`, never comes back whole.
- Through `runPlugin` neither the result nor the audit rows contain the key, the request path, `key=`, the API host or the pinned address.
- A non-public answer for `api.giphy.com` is refused (exit 2 `blocked`) before connecting; a redirect is refused (exit 2 `redirect`) after one dial without following it or echoing its Location.
- 401, 403, 400, 422, 429 and 503, a `text/html` body, malformed JSON, a body over the byte cap and a failed connection map to `auth`, `auth`, `bad-request`, `bad-request`, `rate-limited`, `http-status`, `content-type`, `invalid-json`, `too-large` and `network` without the server's or the transport's text (a failed connection is `gif-search network: api.giphy.com: request failed (connection failed)`).
- With `CORVIDINHO_DAILY_SPEND_CAP_USD` set to something that is not a number, the search is stopped with the `spend-cap` ask (exit 2, "Work is paused for budget."), with no DNS, request or ledger row and without echoing the value.
- The run's abort reaches a pending search (`aborted`, the transport's signal aborted), a stalled one times out, and a run already stopped sends nothing; an unexpected failure is the fixed `gif-search unexpected: the GIF search failed unexpectedly` line.
- Tests in `tests/gif.search.test.ts` (a new module on the base sources) fail on the base sources and pass after.

## Modified

### REQUIREMENT REQ-plugins-318

The plugin host SHALL provide a typed `web-search` builtin (PLUGIN-7, #318)
registered from `plugins/web` next to `web-fetch` (`loadWebPlugins`,
`createWebCommands`) and declared `dangerous: true` and `minTier: 1`
(PLUGIN-2): being dangerous it SHALL need SAFE-1 consent (left out of the
default tool catalog, offered and run non-interactively only when
`CORVIDINHO_ALLOWLIST` names it, never at the read tier) and every run SHALL
be audited (SAFE-5, through `runPlugin`). It SHALL be for the owner and the
team only (PLUGIN-9, REQ-plugins-065 `TEAM_SEARCH_TOOLS`), never community,
WATCH or schedules; `delegate` / `council` workers never get the key
(REQ-agent-117), so a search there answers not configured. It never posts, so it carries no must-ask entry
(AUTONOMY-11); a post a search run makes still goes through its own tool's
gate. Deep research is not built.
Its handler SHALL, in order: read the key from `BRAVE_SEARCH_API_KEY` in the
run's env only, trimmed, with no default — unset or blank, or not 8–256
printable non-space ASCII characters, SHALL be `ok: false`, exit 1,
`data.code` `not-configured` and an error that starts `web-search
not-configured: web search is not configured` and names
`BRAVE_SEARCH_API_KEY` (never a silent empty result, never the value), with
no DNS, request or spend; parse
`<query words…> | --query <text> [--count N] [--freshness f] [--json]`,
where the query (words joined by one space, control and invisible
characters removed, trimmed) is 1–400 characters and at most 50 words,
`--count` is a whole number (digits only) from 1 to 20 (default 5) and
`--freshness` is `pd`, `pw`, `pm` or `py`, and any other `--flag` is
refused, so a term that starts with `--` goes in `--query` (the usage line
says so); query words and `--query` together, or `--query`, `--count` or
`--freshness` given twice, are refused (never a silently dropped part of the
request) — a usage error is exit 1, `data.code` `usage`, nothing sent; refuse (exit 2, `data.code` `secret`, SAFE-6) a query that
carries a value `scrubSecrets` would redact or the value of a set secret env
var (`redactSecretEnvValues`, the key included), also once every format
character (a joiner) is taken out, before any spend or request; end a run
that is already stopped (its abort signal set) as `aborted` (exit 1) with no
reservation and nothing sent; reserve its price against the SAFE-8
cap (REQ-agent-098 `reserveFlatSpend`, `BRAVE_SEARCH_COST_MICRO_USD` 5000 =
$0.005, provider `api.search.brave.com`, model `brave-web-search`) — a
stopped reservation SHALL be `ok: false`, exit 2, `data.code` `spend-cap`,
the error `web-search spend-cap: refused: Work is paused for budget.
(SAFE-8)` (no amount, cap or setting name, SAFE-14.a) and the spend-cap ask
in `PluginHandlerResult.spendAsk`, with nothing sent; then send one
`GET https://api.search.brave.com/res/v1/web/search` with `q`, `count`,
`safesearch=moderate` (always, explicitly) and `freshness` when given, and
the key only as the `X-Subscription-Token` header, through the keyed JSON GET
(REQ-plugins-3181) with `api.search.brave.com` as the only allowed host and
the run's abort signal. The reservation SHALL settle as the call's cost on a
2xx, to 0 on an HTTP error reply or a refusal before connecting, and stay at
the estimate on any other failure.
A 401 / 403, or a 422 whose `error.code` is `SUBSCRIPTION_TOKEN_INVALID`,
SHALL be `auth` (naming `BRAVE_SEARCH_API_KEY`); another 422 `bad-request`;
429 `rate-limited`; any other status `http-status` with the numeric status
only — the server's text is never shown. Any other failure SHALL be the
fixed line `web-search unexpected: the search failed unexpectedly` (exit 1),
never the error's own text. Refusals (`secret`, `spend-cap`,
`scheme`, `host`, `blocked`, `redirect`) SHALL exit 2 and other failures
exit 1, each with `data.code` and one line of at most 300 characters: controls and
invisible characters normalised first, then scrubbed, then capped.
On success the hits SHALL be Brave's `web.results[]` entries, at most
`count`: title and description (and `age` when given) reduced from HTML to
one line of plain text (entities decoded, tags, control and invisible
characters (zero-width, bidi, soft hyphen, tag characters) removed; capped at 200 / 500 / 64 characters) and the URL kept only when it
parses as an http(s) URL without credentials of at most 2048 characters
(else the hit is dropped). Every title, URL, description and age SHALL reach
the model only inside the untrusted web fence (`fenceUntrusted`, source
`brave-search`, a per-call random marker id): the fenced body lists the hits
numbered (title, `URL:` line, description, `Age:` line) or `(no results)`.
`data` SHALL be `{ provider: "brave", attribution: "Powered by Brave
Search", safesearch: "moderate", count, freshness?, results, untrusted:
true, content }`, and the summary `web-search: <n> result(s) from Brave
Search (safesearch moderate[, freshness f]). Powered by Brave Search.`
(`--json` / json mode: the summary alone; otherwise followed by the fenced
content). The SAFE-13 detector SHALL scan the result (REQ-agent-071). No
output, error, data field or audit row SHALL carry the key, the request URL,
a request header or the pinned address: every returned string SHALL pass
`scrubSecrets` and `redactSecretEnvValues` (the key is a SAFE-6 secret env
name, REQ-discord-417) as its last step, after the fence and any control or
invisible-character strip, so a key split by such a character is never
rebuilt. The Brave attribution is in the tool result only (`data` and the
summary the model reads); no reply footer adds it. No table, column or schema version; one new env var,
`BRAVE_SEARCH_API_KEY` (documented in `.env.example` and
`docs/DISCORD-GO-LIVE.md` E.3.a).

Acceptance Criteria
- `plugins list` shows `web-search` with dangerous=true, minTier=1 next to `web-fetch`; the catalog offers it at tool/code tier only when the allowlist names it, never at read tier; a non-interactive run without the allowlist entry is denied (SAFE-1) with a `denied` audit row, and an allowlisted run records `started` then its outcome (SAFE-5).
- The owner, no role session and team (chat and `/work`) are offered it when allowlisted; community never is; a community role session's `runPlugin web-search` gets the role refusal while a team one reaches the handler.
- With a fake key, one request goes to the pinned address of `api.search.brave.com` at `/res/v1/web/search` with `q`, `count=5`, `safesearch=moderate` and the key only in `X-Subscription-Token`; `--count 20 --freshness pw` and `--query` are passed.
- A count of 0, 21, 5.5, `abc`, `-3` or `1e1`, a missing count value, an unknown freshness or flag, query words together with `--query` (either order), `--query`, `--count` or `--freshness` given twice (`--query "cute cat" --query dog` is `--query given twice`, never `dog` alone), a `--verbose` term outside `--query`, a missing, blank, 401-character or 51-word query are usage errors (exit 1) with no DNS or request; the usage line says a term that starts with `--` needs `--query`, and `--query "what does --verbose do"` is taken whole.
- No key, a blank key and a malformed key give the `not-configured` error, starting `web-search not-configured: web search is not configured` and naming `BRAVE_SEARCH_API_KEY`, no DNS and no request, never an empty success; the malformed value is not echoed.
- A query carrying a `ghp_…` token, a set secret env value or the key is refused with exit 2 before DNS, request or spend, and the value is not echoed.
- Hostile titles and descriptions (an injection line, a guessed end marker, control characters, HTML) appear only inside the fence, whose end marker is unique and last; HTML, entities and controls are reduced; nothing of a hit appears outside the fence; the summary carries the Brave attribution; at most `count` hits; `javascript:` and credentialed URLs are dropped; no results is an ok `(no results)`.
- A server echoing the key in results, a 422 body, a 500 body, a non-JSON body, a transport error or a DNS error: nothing returned (json or text mode) contains the key; through `runPlugin` neither the result nor the audit rows contain the key, the request path, the header name or the pinned address.
- The key split by a zero-width space, a soft hyphen, a bidi isolate, a tag character or BEL in a title, URL, description and age (json and text mode), or in a resolver answer a SAFE-7 refusal names, never comes back whole: the fenced content shows `[redacted:env-secret]`, and `fenceSearchResults` scrubs after the fence; a query carrying the key split by a joiner is refused (`secret`).
- 401, 403, 422 `SUBSCRIPTION_TOKEN_INVALID`, 422 `VALIDATION`, 429 and 503 map to `auth`, `auth`, `auth`, `bad-request`, `rate-limited` and `http-status` without the server's text; a redirect is exit 2 `redirect` without the Location.
- The run's abort reaches a pending search: it ends `aborted` and the transport's own signal is aborted; a run already stopped sends nothing (no DNS, no request).
- An unexpected failure (a resolver answer that throws) is the fixed `web-search unexpected: the search failed unexpectedly` line, with neither the key nor the request path.
- Regression tests in `tests/web.search.test.ts` fail on the base sources and pass after; the repeated-flag rows (#318 slice B review) fail on slice A's head and pass after.

### REQUIREMENT REQ-plugins-3181

`plugins/web/api.ts` SHALL provide the one request path for commands that
call a fixed third-party JSON API with a secret key: `web-search`
(REQ-plugins-318, its key in a request header) and `gif-search`
(REQ-plugins-3182, its key in the URL's query, which is why no error or
result carries the request URL): `apiGetJson({ url, allowedHosts,
headers?, signal? }, deps?)` with `resolver`, `transport`, `timeoutMs` and
`maxBytes` seams. Before DNS it SHALL refuse a URL that is not `https`
(`scheme`), carries credentials (`blocked`), or whose host (lower-cased,
trailing dot dropped) is not in the calling command's `allowedHosts` or whose
port is not the default (`host`) — SAFE-7. It SHALL then apply the
`web-fetch` address guard (REQ-plugins-111), shared from `fetch.ts`
(`pinTargets`, `dialPinned`, `readCapped`, `mediaType`): resolve once,
refuse if any answer is not a public address (`blocked`, SAFE-7), and dial
only the checked IPs, pinned, in answer order, with Host and TLS SNI keeping
the name. The request SHALL carry `User-Agent`, `Accept: application/json`
and `Accept-Encoding: identity` plus the caller's headers. Every 3xx reply
SHALL be refused (`redirect`) and never followed, its `Location` never read
or echoed. A non-2xx reply SHALL be an `http-status` error carrying the
numeric status and, best effort, the parsed JSON body for the caller to map a
provider's fixed error code, never shown. A 2xx body SHALL be JSON
(`application/json` or a `+json` media type, a valid RFC 6838 token,
otherwise `content-type`), identity-encoded (otherwise `content-type`), at
most 1 MiB (`API_MAX_BYTES`; more is `too-large`, never parsed) and valid
UTF-8 JSON (otherwise `invalid-json`). DNS, connect and body SHALL share one
15 s deadline (`API_TIMEOUT_MS`, `timeout`) and the caller's signal SHALL
abort the call (`aborted`). The result SHALL be `{ status, json, bytes }`
only: no error or result SHALL carry the request URL (its query may hold a
key), a request header, server text or a transport's or resolver's free
text — an error names at most the host, a SAFE-7 refused address and a fixed
reason (an `E…` code, `TLS error` or `connection failed`).
`API_NOT_SENT_CODES` (`invalid-url`, `scheme`, `host`, `blocked`, `dns`)
SHALL name the codes raised before anything was sent. `web-fetch` keeps its
own path and behaviour for any public host (http or https, its fixed
headers, manual redirects).

Acceptance Criteria
- `http://`, another host, a look-alike host, port 8443 and URL credentials are refused before DNS or any dial; the allowlisted host in upper case with a trailing dot and port 443 passes.
- The allowlisted host resolving to loopback, private, link-local / metadata, `::1` or unique-local (alone or next to a public answer) is refused before connecting; a public answer is the only address dialed.
- 301, 302, 303, 307 and 308 are refused after one dial and one DNS lookup, and the error does not carry the Location.
- `text/html`, `gzip` encoding, a missing content type, malformed JSON and a body over the byte cap are refused; `application/vnd.api+json` is read; `API_MAX_BYTES` is 1 MiB and `API_TIMEOUT_MS` 15 s; a stalled transport times out and the caller's abort stops the call, and in both cases the transport's own request signal is aborted.
- A body that fails mid-read is `network`, naming the host and a fixed reason (`ECONNRESET`) only.
- A connect, TLS or DNS failure names only the host and a fixed reason (`ECONNREFUSED`, `TLS error`, `ENOTFOUND`), never an address, the path or query, or the transport's or resolver's text.
- `web-fetch` still fetches http and https URLs on any public host with its own fixed headers and no key header.
- `gif-search` calls it with `api.giphy.com` as its only allowed host and its key in the URL query: a non-public answer and every redirect are refused, its fixed error codes (`too-large` and `network` included) carry no server or transport text, and no result, error or audit row carries the request URL or the key (`tests/gif.search.test.ts`).
- Tests in `tests/web.search.test.ts` and `tests/gif.search.test.ts`.

### REQUIREMENT REQ-plugins-065

The plugin layer SHALL gate every mutating plugin by the acting role —
owner, team or community (IDENTITY-8..12, #65) — resolved at every call by
`resolveActingRole(env)` (`src/plugins/roles.ts`), never from the prompt:
`null` outside a role session (`CORVIDINHO_ACTING_IS_ADMIN` unset: local CLI,
no role gate); `owner` when the ADMIN re-check passes (`resolveActingIsAdmin`:
bridge bit + configured owner, not muted or deny-listed — IDENTITY-9, as
ROLES-CHAT-4); `team` only when the spawning surface allows it
(`CORVIDINHO_ACTING_ROLE` is `team`, or `owner` for a caller no longer the
owner; with no stamp the ADMIN bit alone caps at owner, `actingRoleCap`) AND
the acting Discord user id, matched in the owner's people list re-read now
(`loadDeclaredPeople` + `resolvePerson`, stable ids only), is a person whose
role is team, not muted (`DISCORD_MUTED_USER_IDS`) and not on
`[discord].deny_users`; else `community` — undeclared, declared community or
without a role, WATCH / schedules / workers (community stamp or no actor), and
any read failure. A stamp never raises the role. `roleAllowsPlugin(role, cmd,
workTask)` SHALL be the one rule: read plugins for every role; mutating
plugins (`isMutatingPlugin`) for the owner and `null`; for team only
`TEAM_REVIEW_TOOLS` (`github-issue-comment`, `github-pr-review`) and
`TEAM_SEARCH_TOOLS` (`web-search` and `gif-search`, PLUGIN-9: "Web search and
GIF search are for me and the team only, and stay off until I allow them,
like web-fetch"; on every team session, still SAFE-1 allowlisted and SAFE-5
audited; `web-fetch` and `discord-send-file` stay the owner's) plus, when
`CORVIDINHO_ACTING_WORK_TASK` is truthy (a `/work` run), `TEAM_WORK_TOOLS`
(`files-write`, `files-edit`); for community none (IDENTITY-10/11).
`runPlugin` SHALL refuse a mutating plugin the role does not allow with the
existing `Denied: plugin "<name>" is not allowed for your role
(ROLES-CHAT-3).` (exit 2) before SAFE-1, the audit row or the handler; SAFE-1,
SAFE-2, SAFE-5 and the memory ACL (forget / override stay owner-only,
REQ-plugins-011) still apply to whatever the role allows. A team review is
feedback: `github-pr-review` SHALL refuse `--event APPROVE` and
`REQUEST_CHANGES` with the role refusal (exit 2, naming IDENTITY-10) unless
the role, re-resolved at that call, is owner or there is no role session, so
a team member never gets an approval that counts toward, or a review that
blocks, a merge. In a team `/work` run `files-write` and `files-edit` SHALL
refuse a secret-looking path (`isSecretPath`, as named or as resolved; exit
2, ROLES-CHAT-8) like the read tools, so an edit is never a read oracle for a
secret file; the owner and the local CLI keep it.
`checkRepoGateForActingRole(repo, { write })` SHALL keep deny lists first,
then: team reads pass on a GITHUB-6-allowlisted repo or a confirmed-public one;
team writes (`write: true`, passed by `github-issue-create`,
`github-issue-comment`, `github-pr-create`, `github-pr-review`) pass only on an
allowlisted repo; community reads keep the confirmed-public path
(ROLES-CHAT-8) and community writes are refused; owner and `null` keep the
GITHUB-6 allowlist. Secret-path hiding (REQ-plugins-267) keeps treating team
like community. No new table, column or schema version; the two env keys are
internal, set only by the Discord spawn client.
In a scheduled run (`isScheduleRunEnv`, REQ-plugins-496)
`checkRepoGateForActingRole` SHALL first refuse, after the deny lists, a repo
off the GITHUB-6 allowlist for every role with no visibility lookup
(DISCORD-SCHEDULE-3.a); the role rules above then apply unchanged to what
passes.

Acceptance Criteria
- A `role = "team"` person with a team stamp resolves team; the same person with a community stamp, no stamp, muted, deny-listed or demoted in the file resolves community at the next call; an owner stamp for a team person resolves team; undeclared, declared-community and no-role people resolve community even with a team stamp; the owner with the bridge bit resolves owner; no role session resolves null; an unreadable allowlist file resolves community.
- `roleAllowsPlugin` allows every read plugin for every role, every plugin for owner and null, only the review and search tools (plus the work tools with the work flag) of the mutating plugins for team, none for community; `TEAM_SEARCH_TOOLS` is exactly `web-search` and `gif-search`, and the team catalog offers both (allowlisted) while the community catalog offers neither; team still gets neither `web-fetch` nor `discord-send-file`; a community role session's `runPlugin gif-search` gets the role refusal while a team one reaches the handler (`tests/gif.search.test.ts`).
- As team, `github-issue-comment` and `github-pr-review` run (dry-run) on an allowlisted repo and a non-allowlisted repo gets GITHUB-6; every other mutating plugin gets the role refusal; `files-write` runs only with the work flag and SAFE-2 still refuses `.env`; memory store/recall stay in the actor's scope, forget/override are refused.
- As team, `github-pr-review --event COMMENT` runs and `APPROVE` / `REQUEST_CHANGES` (any case) get the role refusal naming IDENTITY-10; the owner runs all three events.
- In a team `/work` run `files-write` refuses `credentials.json`, `id_rsa`, `*.pem` and `.ssh/…`, and `files-edit` on a secret file refuses without saying whether the old string matched, leaving the file unchanged; the owner edits it.
- Team reads pass on an allowlisted or confirmed-public repo and are refused on a private non-allowlisted one; team writes on a public non-allowlisted repo are refused; community writes are refused; deny lists win.
- Every existing ROLES-CHAT test passes unchanged; regression tests in `tests/roles.team.test.ts` fail on the base sources and pass after.
- In a scheduled run a public repo off the allowlist is refused for every role before any visibility lookup, and the role rules still apply to an allowlisted one (`tests/github.schedule-repo-gate.test.ts`).

### REQUIREMENT REQ-plugins-113

Running `fledge-<command>` SHALL execute
`fledge --non-interactive plugins run <command> -- <argv...>` as an argv array
(no shell interpolation) with cwd pinned to the bound project root, stdin
closed, and a child env that drops `CORVIDINHO_*`,
`DISCORD_*`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`,
`BRAVE_SEARCH_API_KEY` (PLUGIN-7) and `GIPHY_API_KEY` (PLUGIN-8),
keeps the rest (including GitHub tokens for GitHub-backed Fledge plugins), and
sets `FLEDGE_NON_INTERACTIVE=1` and `CORVIDINHO_PROJECT_ROOT`. The `--` SHALL
end fledge's own options so model-supplied argv such as `--help`, `--json`
or `--ni` reach the plugin verbatim (fledge 1.8 passes everything after one
`--` to the plugin). Output SHALL be
secret-scrubbed with `scrubSecrets` (SAFE-6) and capped per stream; a run
SHALL time out (default 120 s) and be killed with exit 124; the calling run's
abort signal (AGENT-3) SHALL stop it with exit 130 (`aborted`), and an
already-aborted call SHALL not start fledge. Fledge SHALL run in its own
process group and a timeout or abort SHALL stop its whole process tree
(REQ-plugins-154), including a grandchild left holding the output pipes after
the plugin exited. A non-zero exit
SHALL be a failed result carrying that exit code; a binary that cannot start
SHALL fail with exit 127 instead of throwing. SAFE-1 SHALL deny the command in
non-interactive mode unless `fledge-<command>` is allowlisted, and SAFE-5
audit rows SHALL be recorded as for any dangerous plugin.

Acceptance Criteria
- Non-interactive without allowlist → exit 2 with SAFE-1; allowlisted → argv is `plugins run hello -- <argv...>` and the fake plugin sees each argv item verbatim (spaces, `$(…)`, `;` not interpreted), cwd = project root.
- `--help`, `--json`, `--ni` and a literal `--` as argv reach the plugin in order, and fledge's own help is never printed.
- The child env lacks Discord / Corvidinho LLM / audit keys, `BRAVE_SEARCH_API_KEY` and `GIPHY_API_KEY` (`tests/gif.search.test.ts`), keeps `GITHUB_TOKEN`, and has `FLEDGE_NON_INTERACTIVE=1`.
- Exit 7 → ok=false exitCode 7; sleep past a 200 ms timeout → exitCode 124; missing binary → 127.
- A timeout kills a same-group and a `setsid` grandchild, and a background grandchild left after the plugin exited; an abort returns exit 130 with `aborted` and kills the tree.
- A `ghp_…` token in plugin output is redacted and output past the cap is truncated with a marker.
