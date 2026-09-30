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
`--query` together are refused — a usage error is exit 1, `data.code`
`usage`, nothing sent; refuse (exit 2, `data.code` `secret`, SAFE-6) a query
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
`GIPHY_MEDIA_HOSTS` (`media.giphy.com`, `media0.giphy.com` to
`media4.giphy.com`, `i.giphy.com`; no suffix match, no trailing dot), of at
most 2048 characters. A result with neither link SHALL be dropped; nothing
else is filtered or reordered, and GIPHY's page URLs (`url`, `itemurl`) are
not returned. Every title and link SHALL reach the model only inside the
untrusted web fence (`fenceUntrusted`, source `giphy-search`, a per-call
random marker id): the fenced body lists the results numbered (title, `GIF:`
and `Small GIF:` lines) or `(no results)`. `data` SHALL be `{ provider:
"giphy", attribution: "Powered By GIPHY", contentfilter: "medium", limit,
results, postAs: "link", untrusted: true, content }`, and the summary
`gif-search: <n> GIF(s) from GIPHY (contentfilter medium: rated G and PG).
Post one as a link in your reply (Discord shows it from GIPHY); never
download or attach it. Powered By GIPHY.` (`--json` / json mode: the summary
alone; otherwise followed by the fenced content). The SAFE-13 detector SHALL
scan the result (REQ-agent-071). No output, error, data field or audit row
SHALL carry the key, the request URL (its query holds the key), the pinned
address or GIPHY's text outside the fence: every returned string SHALL pass
`scrubSecrets` and `redactSecretEnvValues` (`GIPHY_API_KEY` is a SAFE-6
secret env name, REQ-discord-417) as its last step, after the fence and any
control or invisible-character strip. No table, column or schema version;
one new env var, `GIPHY_API_KEY` (documented in `.env.example` and
`docs/DISCORD-GO-LIVE.md` E.3.b, which also carry "Powered By GIPHY").

Acceptance Criteria
- `plugins list` shows `gif-search` with dangerous=true, minTier=1 and no must-ask entry; it is in `NO_STATE_CHANGE_TOOLS`; the catalog offers it at tool/code tier only when the allowlist names it, never at read tier; a non-interactive run without the allowlist entry is denied (SAFE-1) with a `denied` audit row, and an allowlisted run records `started` then its outcome (SAFE-5).
- The owner, no role session and team (chat and `/work`) are offered it when allowlisted; community never is; team still gets neither `web-fetch` nor `discord-send-file`; a community role session's `runPlugin gif-search` gets the role refusal while a team one reaches the handler.
- With a fake key, exactly one request goes out, to the pinned address of `api.giphy.com` at `/v2/search`, with exactly `q`, `key`, `client_key=corvidinho`, `limit=5`, `media_filter=gif,tinygif` and `contentfilter=medium`, and only the fixed API headers (no key header); no GIF is downloaded.
- A query of `cats&contentfilter=off&rating=r` (and similar) is sent as the `q` value only, with one `contentfilter=medium`, one `key` and no `rating` parameter.
- `--contentfilter off`, `--rating r`, `--media-filter mp4`, `--download`, a limit of 0, 11, 2.5, -1 or a missing one, query words together with `--query`, and a missing, blank or 51-character query are usage errors (exit 1) with no DNS or request; the usage line says the safety filter is fixed at medium.
- No key, a blank key, a key with a space and a 5-character key give the `not-configured` error, starting `gif-search not-configured: GIF search is not configured` and naming `GIPHY_API_KEY`, with no DNS and no request, never an empty success.
- A query carrying a `ghp_…` token, a set secret env value (Discord, Brave) or the GIPHY key (also split by a joiner) is refused with exit 2 before DNS, request or spend, and the value is not echoed.
- Titles and links appear only inside the fence in GIPHY's order (a hostile title, a guessed end marker and control characters included); the end marker is unique and last; HTML and entities are reduced; nothing of a result appears outside the fence; `data` and the summary carry `Powered By GIPHY`, `postAs: "link"` and the link-only guidance.
- Links over http, off the GIPHY media hosts (look-alike and suffix hosts, `giphy.com` page URLs, `media5`), with credentials, on port 8443, with a trailing-dot host or over 2048 characters are dropped; a result with only a valid `tinygif` keeps only its `Small GIF:` line; a result with no valid link is dropped; the rest keep GIPHY's order up to `--limit`.
- No results is an ok `(no results)`; a 2xx `{ error: … }` body is `api-error` and a 2xx body without `results` is `bad-response`, neither showing GIPHY's text.
- A server echoing the key or the request URL in titles, links, a 401 body, a 500 body, a 2xx error body, a non-JSON body, a redirect Location, a transport error or a DNS error: nothing returned (json or text mode) contains the key or the request's query string, and no error carries the path, `key=` or the Location; GIPHY's own echo inside the fence shows `key=[redacted:env-secret]`.
- The key split by a zero-width space, a soft hyphen, a bidi isolate, a tag character or BEL in a title or link (json and text mode), in a resolver answer a SAFE-7 refusal names, or straight into `fenceGifResults`, never comes back whole.
- Through `runPlugin` neither the result nor the audit rows contain the key, the request path, `key=`, the API host or the pinned address.
- A non-public answer for `api.giphy.com` is refused (exit 2 `blocked`) before connecting; a redirect is refused (exit 2 `redirect`) after one dial without following it or echoing its Location.
- 401, 403, 400, 429 and 503, a `text/html` body and malformed JSON map to `auth`, `auth`, `bad-request`, `rate-limited`, `http-status`, `content-type` and `invalid-json` without the server's text.
- The run's abort reaches a pending search (`aborted`, the transport's signal aborted), a stalled one times out, and a run already stopped sends nothing; an unexpected failure is the fixed `gif-search unexpected: the GIF search failed unexpectedly` line.
- Tests in `tests/gif.search.test.ts` (a new module on the base sources) fail on the base sources and pass after.

## Modified

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

### REQUIREMENT REQ-plugins-114

The system SHALL measure the context cost of each loaded plugin command on the
exact tool definition sent to the model (`toolDefForEntry`), as JSON
characters and approximate tokens (chars/4), and SHALL report the loaded tool
surface as a whole (FLEDGE-5 / PLUGIN-6): total approximate tokens if every
loaded command were offered, a default budget of ~8500 tokens
(`TOOL_SURFACE_BUDGET_TOKENS`; 8000 until `gif-search`, #318, took every
builtin, all three language runners and one small Fledge plugin to about
8.08k) with an over-budget flag, subtotals by origin (`builtin` or
`fledge:<plugin>@<version>`), the largest schemas, and commands whose schema
exceeds a ~250-token soft cap. `PluginCommand` MAY carry an `origin`; the
registry `list()` shape is unchanged.

Acceptance Criteria
- `withToolCost` adds `origin`, `schemaChars`, `approxTokens` (= ceil(schemaChars/4)) per entry.
- `toolSurfaceReport` totals match the per-entry sum, group by origin, and flag over-budget / oversized with small test budgets.
- Every builtin (`gif-search` and `web-search` included, with all three language runners on PATH) plus a small fake Fledge plugin stays under the default budget of 8500 (`tests/fledge.plugins.test.ts`).
- The text view prints per-command `~N tok`, the total vs budget with `OVER BUDGET` when exceeded, per-origin subtotals and oversized names.
