# Lesson bundle — web-search-through-brave-plugin-7-plugin-9-issue-318-a-dangerous-mintier-1-web-search-command-in-plugins-web-offered

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Web search through Brave (PLUGIN-7, PLUGIN-9, issue 318): a dangerous minTier-1 web-search command in plugins/web, offered only when allowlisted and only to the owner and team; Brave results reach the model only inside the untrusted web fence and are SAFE-13 scanned; the key comes from BRAVE_SEARCH_API_KEY only and never appears in any output; requests go through a shared https-only, host-allowlisted, redirect-refusing JSON GET on the pinned-DNS public-address checks; each search reserves about 0.005 USD against the SAFE-8 cap
- **Kind**: Feature
- **Specs**: plugins, agent, discord, cli
- **Paths**: plugins/web/api.ts, plugins/web/search.ts, plugins/web/commands.ts, plugins/web/fetch.ts, plugins/web/index.ts, src/plugins/roles.ts, src/plugins/types.ts, plugins/fledge/spawn.ts, src/agent/execute.ts, src/agent/task-summary.ts, src/agent/spend.ts, src/agent/untrusted.ts, src/agent/loop-guards.ts, src/autonomous/delegate.ts, src/store/scrub.ts, tests/preload.ts, tests/web.search.test.ts, tests/web.fetch.test.ts, tests/roles.team.test.ts, .env.example, docs/DISCORD-GO-LIVE.md, docs/discord.md, specs/plugins/plugins.spec.md, specs/plugins/requirements.md, specs/plugins/testing.md, specs/agent/agent.spec.md, specs/agent/requirements.md, specs/agent/testing.md, specs/discord/discord.spec.md, specs/discord/requirements.md, specs/cli/cli.spec.md, specs/cli/requirements.md, tests/fixtures/preload-probe.ts, tests/preload.operator-data-dir.test.ts, specs/cli/testing.md, specs/discord/testing.md, hi/plugin.md, INTENT.md, src/discord/rich-reply.ts
- **Acceptance**: PLUGIN-7 and PLUGIN-9 are captured verbatim in hi/plugin.md with the hi CLI. In tests/web.search.test.ts (no network: fake resolver and fake transport, fake key test-key-not-real): web-search is registered next to web-fetch with dangerous=true and minTier=1, offered at tool/code tier only when CORVIDINHO_ALLOWLIST names it and never at read tier, denied non-interactively without the entry (SAFE-1, denied audit row) and audited started/outcome when allowlisted (SAFE-5); owner, no role session and team (chat and /work) are offered it, community never, and a community role session is refused at runPlugin while a team one reaches the handler (PLUGIN-9, TEAM_SEARCH_TOOLS = web-search only, web-fetch stays owner-only); with a key one GET goes to the pinned public address of api.search.brave.com /res/v1/web/search with q, count 5 (1-20 whole numbers only), safesearch=moderate always and freshness pd|pw|pm|py when given, the key only in X-Subscription-Token; bad counts, freshness, flags and queries are usage errors with nothing sent (query words together with --query are refused, and a term that starts with -- goes in --query); no key or a malformed key is a clear not-configured error, starting web-search not-configured: web search is not configured and naming BRAVE_SEARCH_API_KEY, with no DNS or request (never an empty success); a query carrying a secret-looking value or a set secret env value (also split by a joiner) is refused with exit 2 before anything is sent; titles, URLs and descriptions reach the model only inside the untrusted web fence (HTML, entities and controls reduced, at most count hits, non-http URLs dropped, no results is an ok (no results)) with the Brave attribution in the summary; a hit that trips SAFE-13 notes the tool message and drops web-search, web-fetch and files-write for the rest of the run and refuses the later files-write; the key never appears in any result, error, data field or audit row even when the server, a transport error or a DNS error echoes it or an invisible or control character splits it (the secret scrub is the last step, after the fence), and it is dropped from delegate workers, the verify lane (shell and runners) and Fledge children and redacted by formatErrorLine; the keyed JSON GET refuses http, other hosts and ports and URL credentials before DNS, non-public answers before connecting, every redirect (Location never echoed), non-JSON, compressed, oversized and malformed bodies, times out at 15 s and stops on the run's abort (the transport's own signal is aborted in both cases; a run already stopped sends nothing), and never returns the request URL; Brave 401/403/422/429/5xx map to fixed codes without server text, a body that fails mid-read is a network error and any other failure is one fixed line; with CORVIDINHO_DAILY_SPEND_CAP_USD set each search reserves 5000 micro-USD before the request and settles actual / 0 on HTTP error or pre-connect refusal / estimate on network failure, timeout, unreadable 2xx body or an abort after sending, a run already stopped reserves nothing, an unavailable ledger fails closed with the ledger-unavailable ask, no cap opens no database, and at the cap nothing is sent, the error says only Work is paused for budget. and the tool loop ends the attempt with the spend-cap ask after one model call (the tool-loop tests configure CORVIDINHO_LLM_MODEL, AGENT-13); with only CORVIDINHO_PROVIDER_SPEND_CAPS_USD set a search is recorded at 5000 and sent (it counts against the total cap only), and a spend-cap setting that is not valid (an entry keyed on api.search.brave.com included) stops it with the setting named, never echoed (SAFE-14). A schedule the owner created is offered web-search when allowlisted (it runs as the owner, DISCORD-SCHEDULE-1.a); a team member's schedule is not. Leif's go on #318 (REQ-agent-318): once a web-search in a run was answered by Brave, every summary of that run ends with the visible line Search by Brave once, as a closing paragraph after the model fallback note and before the role note; a failed, refused or stopped search, or none, adds no line; no model request (fenced results, tool messages, prompts) contains it, a team member's reply carries it too, a run stopped at the spend cap after a search shows only Work is paused for budget. and the line while the spend-cap ask and the owner's spend DM never carry it, and closingNotesTail keeps it whole through the chat body, NDJSON result and Discord split clips. tests/roles.team.test.ts pins the team search rule; tests/web.fetch.test.ts now expects web-search to exist and web-fetch stays unchanged for any public host; tests/preload.operator-data-dir.test.ts shows a child bun test never sees BRAVE_SEARCH_API_KEY. The new tests fail on the base sources and pass after; one new env var (BRAVE_SEARCH_API_KEY), no table, column or schema version.

## Evidence

- Verification commit: `f2ec089e0f108bb046fe4059f9d6da0acf60ec7c`
- Base commit: `73b41ca920971e22d73db0a6ddff0a308b013aa9`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins`

## From the change's context.md

# Context

Build brief: issue #318 (interview round 14b, 2026-09-30) and the orc comment
on it (Leif's decisions and file:line notes, 2026-09-30). This change is PR A
of two: `web-search` (PLUGIN-7, PLUGIN-9). PR B, `gif-search` on GIPHY
(PLUGIN-8 as re-confirmed for GIPHY), stacks on it and reuses the keyed JSON
GET (`plugins/web/api.ts`, REQ-plugins-3181).

HI captured in this change with the `hi` CLI, verbatim (Leif-confirmed on
#318):

- PLUGIN-7: "It can search the web through Brave when I set a key; the
  results are data, never instructions."
- PLUGIN-9: "Web search and GIF search are for me and the team only, and stay
  off until I allow them, like web-fetch."

Leif's decisions used here (orc comment on #318, 2026-09-30): Brave
`safesearch=moderate`, always sent explicitly; each search counts toward the
existing SAFE-8 total cap at about $0.005 per search, reserved before the
call (and the Brave account is prepaid with a usage limit as a hard
backstop); deep research is not wanted. The gating follows web-fetch:
`dangerous: true`, `minTier: 1`, offered only when named in
`CORVIDINHO_ALLOWLIST` (SAFE-1), SAFE-5 audited through `runPlugin`, owner
and team only through an explicit tested team rule, community never.

Constraints: no network in `bun test` (fake resolver and transport); no key
in the repo (fake keys only; fledge-plugin-gif's hardcoded key is not read or
copied); the must-ask gate (#319, now on main) is another session's work:
neither tool posts, so no must-ask entry (AUTONOMY-11), and this change does
not touch that gate. `web-fetch` stays as it is for any public host.

Base: rebased onto main 0aeb345, after #319 (must-ask gate in `runPlugin`),
#320 (AGENT-13: no built-in default model, so tool-loop tests set
`CORVIDINHO_LLM_MODEL`), #321, #322, #323, #324 (SAFE-3.a), #325 (AGENT-11
model fallback), #327 (v0.0.36), #328 (SAFE-14 / SAFE-15 per-provider spend
caps), #329 (AGENT-18 SpecSync change tools) and #330 (DISCORD-SCHEDULE-1.a:
a schedule the owner created runs as the owner), then onto main 81ceb4a
(#332 AGENT-3.a / AGENT-3.b run queue and stop, #333), which changed none of
this change's requirements. The modified REQ-agent-002,
REQ-agent-086, REQ-agent-098, REQ-cli-262 and REQ-plugins-065 deltas start
from main 0aeb345's canonical text (those PRs changed all five), so they keep
main's lines and add only this change's. After #328, `reserveFlatSpend`
reads every spend-cap setting (`parseSpendCaps`): a search is recorded while
any cap is set and counts against the total cap only, since a SAFE-14
provider cap is keyed on a configured model provider. After #330 the owner's
own schedules run as the owner, so they get `web-search` when it is
allowlisted; schedules other people create still never do.

Leif's go (2026-09-30, https://github.com/CorvidLabs/Corvidinho/issues/318#issuecomment-5918616747): approve this definition (and
gif-search's, #331) as `corvid-agent` per PROCESS-3; replies that used web
search end with a short visible attribution line, "Search by Brave", to meet
Brave's terms. That line is implementation to meet the provider's terms, not
a new `hi` criterion: it is REQ-agent-318 in this change's deltas, so the
approved definition covers it. It is added by the reply path as a closing
note (the pattern of the AGENT-11 fallback note and the ROLES-CHAT-3 role
note), never inside the fence or a tool result, and never in the owner's
spend DMs. Merge order: #326, then #331.

Definition approval: recorded as `corvid-agent` on that go, with the go's
link as the note; nothing is recorded as Leif.

## From the change's design.md

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
  `FlatSpendOutcome` on the existing `SpendLedger` (no schema change). It
  reads every cap setting (`parseSpendCaps`, SAFE-14): `off` only when no cap
  is set; a setting that is not valid stops the call
  (`spendCapInvalidAsk(keys)`); otherwise it reserves against the total cap
  (if set) and names the tripped scope (`spendCapReachedAsk({ trips })`).
- `src/agent/execute.ts`: an offered tool's `spend-cap` `spendAsk` ends the
  attempt with `SPEND_CAP_SUMMARY` and the ask. An offered tool in
  `REPLY_ATTRIBUTION_BY_TOOL` that returns `ok` reports its line
  (`onReplyAttribution`); `createTaskExecute` keeps the run's lines and, after
  each attempt, adds them once with `withReplyAttribution` (after the model
  fallback note, before the role note).
- `src/agent/task-summary.ts` (REQ-agent-318): `REPLY_ATTRIBUTION_BY_TOOL`
  (`web-search` → "Search by Brave"), `replyAttributionNote`,
  `withReplyAttribution`; `closingNotesTail` peels the role note, then the
  attribution paragraph (only known lines), then the fallback note, so every
  clip (`clipKeepingRoleNote`: `resultFrame`, `chatBodyFromTaskResult`, the
  post clips, `planAnswerParts`) and Discord's split keep the line at the
  end. Chosen over a Discord-only footer: every surface (Discord replies,
  schedule posts, the CLI) already carries the closing notes, and the line
  never enters anything the model reads. The GIPHY line (#331) is one more
  map entry.
- `src/agent/untrusted.ts`: `web-search` in `INJECTION_SCAN_TOOLS` and in the
  tool-call payload names; `src/agent/loop-guards.ts`: in
  `NO_STATE_CHANGE_TOOLS`.
- Key lists: `WORKER_ENV_DROP`, Fledge `DROP_KEYS`, `SECRET_ENV_NAMES`,
  `tests/preload.ts`.
- GIPHY (PR B) will be free-tier: the same `reserveFlatSpend` can record a $0
  row or skip it; that choice is PR B's.

## From the change's testing.md

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
- SAFE-14 (after the rebase onto #328): with only
  `CORVIDINHO_PROVIDER_SPEND_CAPS_USD=llm.test=1` set (that provider already
  at its cap) a search is sent and settles `actual` at 5000; an entry keyed on
  `api.search.brave.com` makes the setting not valid: nothing sent, the ask
  names the setting, never its value.
- DISCORD-SCHEDULE-1.a (after the rebase onto #330): a schedule the owner
  created is offered `web-search`; a team member's schedule is not.
- The "Search by Brave" reply line (REQ-agent-318, Leif's go on #318): the
  map holds only `web-search`; two answered searches and a retry end the
  reply with the line once, and no model request contains it; an answer that
  already ends with it is not doubled; no line with no search, no key, a 429
  or a refused query; a team member's reply carries it; a run stopped at the
  spend cap after a search ends `SPEND_CAP_SUMMARY` plus the line, while the
  ask's question and `formatSpendStopDm` never carry it; `closingNotesTail`,
  `chatBodyFromTaskResult`, `resultFrame` and `planAnswerParts` keep it whole
  at the end (after the fallback note, before the role note).

Updated: `tests/web.fetch.test.ts` (web-search now exists),
`tests/roles.team.test.ts` (team search rule, team catalog),
`tests/preload.operator-data-dir.test.ts` and `tests/fixtures/preload-probe.ts`
(a child `bun test` never sees `BRAVE_SEARCH_API_KEY`).

## Fail on main

### After the rebase onto main 0aeb345 (then 81ceb4a)

- The pre-change `src/agent/execute.ts`, `src/agent/task-summary.ts` and
  `src/agent/spend.ts` (the rebased branch before this step) swapped in:
  `tests/web.search.test.ts` 36 pass, 6 fail — the SAFE-14 test and the five
  "Search by Brave" tests that need the line (the map, the answered search,
  the team reply, the spend-cap stop, the clips). The "no line" test and the
  owner-schedule test pass there too: they pin what must not appear, and
  main's #330 behaviour.
- Mutations, each caught: the line added for a failed call (`result.ok`
  dropped in the tool loop) fails the "no line" test; `closingNotesTail`
  not knowing the line fails the clip test; `reserveFlatSpend` back on
  `parseSpendCap` fails the SAFE-14 test.
- Branch test files on main 0aeb345's sources (`tests/web.search.test.ts`,
  `tests/web.fetch.test.ts`, `tests/roles.team.test.ts`,
  `tests/preload.operator-data-dir.test.ts` and
  `tests/fixtures/preload-probe.ts` copied into a main worktree): 257 pass, 5
  fail, 1 error. `tests/web.search.test.ts` cannot load (no
  `plugins/web/api.ts`); `web.fetch` fails "registered as a typed builtin";
  `roles.team` fails the catalog by role and `roleAllowsPlugin`;
  `preload.operator-data-dir` fails because the child sees
  `BRAVE_SEARCH_API_KEY`.

### Before the rebase (main 507d97b)

On a worktree of untouched main 507d97b, measured on macOS:

- **Branch test files on main's sources.** `tests/web.search.test.ts`,
  `tests/web.fetch.test.ts`, `tests/roles.team.test.ts`,
  `tests/preload.operator-data-dir.test.ts` and
  `tests/fixtures/preload-probe.ts` were copied in. Result: 254 pass, 5 fail,
  1 error.
  - `tests/web.search.test.ts` cannot load (`Cannot find module
    '../plugins/web/api.ts'`), so all 34 of its tests fail.
  - `web.fetch` fails "registered as a typed builtin", because main has no
    `web-search`.
  - `roles.team` fails `roleAllowsPlugin` and the catalog by role (no team
    search rule).
  - `preload.operator-data-dir` fails "bot run settings … do not reach the
    suite", because the child sees `BRAVE_SEARCH_API_KEY`.
- **Main's versions of the modified sources swapped into this branch.** The
  swapped files are `plugins/web/commands.ts`, `plugins/web/index.ts`,
  `plugins/fledge/spawn.ts`, `src/agent/execute.ts`,
  `src/agent/loop-guards.ts`, `src/agent/untrusted.ts`,
  `src/autonomous/delegate.ts`, `src/plugins/roles.ts`,
  `src/plugins/types.ts`, `src/store/scrub.ts` and `tests/preload.ts`. The
  new `api.ts` / `search.ts`, the export-only `fetch.ts` and
  `reserveFlatSpend` were kept. Result: 32 of 292 fail on behaviour: 28 of
  the 34 in `tests/web.search.test.ts` plus the 4 above. The 6 that pass
  call `apiGetJson` directly (5) or pin that `web-fetch` is unchanged (1).
- **The review-fix tests against the pre-fix implementation (457c2c1).**
  4 of 34 fail:
  - the usage test: query words with `--query` were silently dropped;
  - the split-key test: a key split by a zero-width space came back whole
    in the fenced content, and one split by BEL came back in a SAFE-7 error
    line;
  - the unexpected-failure test: the error carried the request path;
  - the settle test: a run already stopped still reserved.
  The other new tests pin behaviour that was already right: abort and
  deadline reach the transport's signal, 403 maps to `auth`, a body that
  fails mid-read is `network`, and an unavailable ledger fails closed. Each
  of those was checked by mutating the code:
  - the handler not forwarding `ctx.signal`;
  - a fresh signal passed to `dialPinned`;
  - 403 dropped from the auth map;
  - timeout, abort, `invalid-json` and `content-type` treated as not-billed;
  - `reserveFlatSpend`'s catch returning `off`;
  - the scrub moved back in front of the fence;
  - the error line scrubbed before it is normalised;
  - query words allowed with `--query`;
  - no early stop for a run already stopped.
  Every one of these mutations fails at least one test.
- With the branch restored, everything passes: `tests/web.search.test.ts`
  34/34, and the affected files together 447/447 (web.search, web.fetch,
  roles.team, preload.operator-data-dir, docs.operator-facts,
  agent.loop-guards, safe.injection).

## Results (macOS host; the repo is Linux-only)

On main 81ceb4a (the final base; #332 and #333 on top of 0aeb345):

- `bun test` on the branch: 3195 pass, 1 skip, 97 fail, 7 errors. Untouched
  main 81ceb4a on the same host: 3152 pass, 1 skip, 98 fail, 7 errors. Every
  branch failure is one of main's: the 95 names listed below plus #332's two
  macOS-only process-tree tests ("a stop kills the run's process tree; an
  Approve card it waited on closes as a no (AGENT-3, SAFE-20) > a run waiting
  on an Approve card is killed and the card closes as a no" and "… > the
  spawned agent and what it started are killed"). Main's 98th is the flaky
  schedule-worktree test described next, which passed on the branch this
  run.
- `tests/web.search.test.ts`: 42/42; `bunx tsc --noEmit`: clean.

On main 0aeb345, after the rebase and the "Search by Brave" line:

- `bun test` on the branch: 3167 pass, 1 skip, 96 fail, 7 errors. Untouched
  main 0aeb345 on the same host: 3126 pass, 1 skip, 95 fail, 7 errors. The
  95 main failures are the list below (the same 95 names as on 507d97b), and
  the branch fails exactly those plus one flaky test, "schedule tick uses
  project worktree … > tick spawns with cwd under schedule project worktree
  then parks" (`tests/discord.session-worktree.test.ts`: it sleeps 100 ms and
  then expects the worktree gone). That test flakes on untouched main too:
  run alone five times it failed 3 of 5 on main 0aeb345 and 3 of 5 on the
  branch; this change touches neither the scheduler nor worktrees.
- `bunx tsc --noEmit`: clean.
- `hi check`: 182 criteria, 20 families, 19 files, 5 retired.
- `specsync check --require-coverage 100 --no-cache`: 5 specs, 5 passed, 0
  failed; file coverage 208/208 and LOC coverage 100%.
- `tests/web.search.test.ts`: 42/42.
- Tool surface: builtins 8078 tokens (main 7951), under
  `TOOL_SURFACE_BUDGET_TOKENS` 9000 (#329); no schema changed in this step.

Before the rebase, on main 507d97b:

- `bun test` on the branch: 3025 pass, 1 skip, 95 fail, 7 errors. Untouched
  main 507d97b on the same host: 2991 pass, 1 skip, 95 fail, 7 errors. The
  two failure sets are identical (`comm` of the sorted `(fail)` lines shows
  nothing unique to either side). None are in the web-search, web-fetch,
  role, spend, preload or injection tests. They are process-group, signal,
  `/proc`, GNU-tool and `/private` path cases, so a Linux run (CI or the VPS)
  is still needed for a green suite.
- `hi check`: 181 criteria, 20 families, 19 files, 5 retired.
- `specsync check --require-coverage 100`: 5 specs, 5 passed, 0 failed; file
  coverage 206/206 and LOC coverage 100%.
- `specsync change audit` fails while the definition is unapproved: it says
  "meaningful changed paths are not covered by an active change", because a
  draft covers nothing. In a throwaway worktree (never pushed), approving it
  and running `specsync change check` gave `verified` for all 12 REQs and a
  passing audit, and `specsync check --require-coverage 100` still passed.

### macOS-only failures (the same set on the branch and on main 0aeb345, and on main 507d97b before the rebase)

- abort after the agent exited kills what it left holding the output pipe
- bridge stop and start (REQ-discord-346) > start fails a run a killed process left running and removes its worktree; a live process's run is untouched
- bridge stop and start (REQ-discord-346) > start never touches a schedule-run worktree whose run another data dir owns
- bridge stop and start (REQ-discord-346) > stop records the in-flight schedule run failed, kills its agent and removes its worktree
- bridge writes attachments inside the session workspace (DISCORD-9 / REQ-discord-013) > agent files-read opens the image under the session cwd as an image part; git ignores it; session end deletes it
- CLI error boundary (REQ-cli-419) > a throwing plugin handler (unusable data dir) is one line + hint
- CLI error boundary (REQ-cli-419) > a throwing plugin handler with --json prints {ok:false,error}
- CLI error boundary (REQ-cli-419) > discord bridge with an unusable data dir: one line + hint, exit 1
- corvidinho --project <path> (CLI-5, REQ-cli-505) > children the CLI spawns get the project's env, not the start dir's .env values
- corvidinho --project <path> (CLI-5, REQ-cli-505) > loads the project's .env files exactly as starting there would, not the start dir's
- corvidinho backup list|restore and doctor (OPS-1/2) > restore refuses the live DB while a process holds it, even with --force
- corvidinho plugins run fledge-* (FLEDGE-4 / SAFE-1) > allowlisted run goes through fledge plugins run in the project root
- corvidinho-update.sh ready gate (fake box) > REQ-cli-347: pidfile mode: a bridge that never logs in rolls back after CORVIDINHO_READY_TIMEOUT
- corvidinho-update.sh ready gate (fake box) > REQ-cli-347: pidfile mode: a bridge that prints protocol OK then exits 1 on login rolls back
- corvidinho-update.sh ready gate (fake box) > REQ-cli-347: pidfile mode: a bridge that prints the login line passes
- corvidinho-update.sh ready gate (fake box) > REQ-cli-347: systemd mode keeps its systemctl is-active check
- corvidinho-update.sh restart mode + env (fake box) > REQ-cli-347: CORVIDINHO_BRIDGE_CMD with pkill -f cannot kill its own shell
- corvidinho-update.sh restart mode + env (fake box) > REQ-cli-347: env file is loaded before doctor and the unit restart
- corvidinho-update.sh restart mode + env (fake box) > REQ-cli-347: explicit CORVIDINHO_BRIDGE_UNIT wins over a leftover stale pidfile
- corvidinho-update.sh restart mode + env (fake box) > REQ-cli-347: leftover pidfile without a unit keeps pidfile mode
- corvidinho-update.sh restart mode + env (fake box) > REQ-cli-347: rollback after a failed bun install restarts with the env file
- corvidinho-update.sh restart mode + env (fake box) > REQ-cli-347: rollback restart sees the env file
- corvidinho-update.sh restart mode + env (fake box) > REQ-cli-347: unit mode never signals a live pid named by a leftover pidfile
- council plugin (REQ-plugins-118) > the council time cap stops slow voices
- daemon lock > a recycled pid (different /proc start time) is stale
- daemon start recovers what a dead process left (REQ-cli-108) > a schedule-run worktree another data dir owns is never touched, even when started inside it
- daemon stop parks an abandoned run's worktree (REQ-cli-108) > an abandoned run's branch with commits is kept, never force-deleted
- daemon stop parks an abandoned run's worktree (REQ-cli-108) > stop after the grace removes the abandoned run's worktree and empty branch
- delegate plugin handler (fake bin) > lead abort stops the worker (AGENT-3)
- delegate plugin handler (fake bin) > lead abort stops the worker's whole tree (AGENT-3, REQ-agent-117)
- delegate plugin handler (fake bin) > timeout stops the worker
- delegate plugin handler (fake bin) > timeout stops the worker's whole tree, not just the worker (REQ-agent-117)
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > a PNG goes to the conversation's channel as image/png, bytes unchanged, parsing no mentions
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > a server limit lower than 8 MB (Discord 413 / code 40005) is reported, not retried
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > DISCORD-5 / REQ-discord-212: a thread allowlisted by its own id attaches without its parent listed, as the router serves it; a deny on the thread or its parent still wins
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > DISCORD-5 / REQ-plugins-005: a deny-listed thread is refused even under its allowlisted parent (deny wins); nothing checked or uploaded
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > DISCORD-5: the channel allowlist gates first; a thread passes through its allowlisted parent
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > DISCORD-8: an acting user who cannot attach, or a check that cannot run, sends nothing
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > dry run posts nothing
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > only allowed types; an image whose bytes do not match its name, or non-UTF-8 text, is refused
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > over Discord's 8 MB upload limit is refused before any upload
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > REQ-discord-004: a channel the bridge listens in only through DISCORD_CHANNEL_IDS attaches; a deny still wins
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > SAFE-2: a file swapped after the path checks (for a link to .env, or its folder for a link into .ssh) is refused; what is read is what was checked
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > SAFE-5: every attach is on the audit trail like other posts
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > SAFE-6: a text log is secret-scrubbed before upload, the bot token's own value too
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > the 8 MB cap holds for the bytes read: a file that grew past it after its size was checked is refused, reading no more than the cap + 1 byte
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > the caption parses no mentions and is defanged and scrubbed
- files plugins (REQ-plugins-081..083) > SAFE-2: a project under a keystore-named directory stays writable outside its own keystores
- files plugins (REQ-plugins-081..083) > SAFE-2.a: write/edit/delete refuse every path under .fledge/; reads stay allowed (REQ-plugins-083)
- fledge commands registered as dangerous plugins (PLUGIN-2 / SAFE-1) > allowlisted run: argv array (no shell), project cwd, scrubbed env
- fledge discovery (FLEDGE-4 / PLUGIN-3) > non-zero exit, bad JSON and timeout degrade with a reason
- fledge-lanes-run / fledge-run (dangerous, code tier) > timeout returns 124 and an aborted calling run returns 130
- git-diff secret paths (ROLES-CHAT-8) > non-admin git-diff of an explicit secret path is refused like files-read
- nightly ticker (OPS-1/2) > a run a dead process left unfinished is recorded as a failure and told once; a live one is left alone
- plugin argv keeps '--' tokens (REQ-plugins-243) > search-grep treats a '--' pattern as the pattern, not a dropped flag
- project files: doctor and a report-only init name what is missing (CLI-4) > a fledge.toml that is not TOML fails fledge.toml and verify-lane without printing its text; a .specsync file is not a directory
- project files: doctor and a report-only init name what is missing (CLI-4) > doctor in a complete project prints [ok] for each project item and passes
- project files: doctor and a report-only init name what is missing (CLI-4) > doctor in a dir without project files names each missing one and exits 1
- project files: doctor and a report-only init name what is missing (CLI-4) > from a subdirectory of a git project, init points at the project root that has the files instead of creating new ones
- project files: doctor and a report-only init name what is missing (CLI-4) > init in a complete project with a model and its key exits 0 and says nothing is missing
- project files: doctor and a report-only init name what is missing (CLI-4) > init is report only: in an empty dir it names the missing model provider, Fledge, SpecSync and each missing project file, creates nothing, exits 1
- restore (OPS-2) > never overwrites a DB a process holds open, even with --force
- runFledgeCommand failure modes > timeout kills the run and reports exit 124
- SAFE-1 / tier gates apply to the runners (REQ-plugins-313) > a run past the timeout is killed (exit 124)
- SAFE-1 / tier gates apply to the runners (REQ-plugins-313) > the calling run's abort stops the runner's process tree (exit 130)
- schema v10 schedule_runs.runner (REQ-discord-346) > a claimed run records its runner; a v9 DB migrates and its old running row counts as gone
- search plugins (REQ-plugins-081) > search-grep finds matches under cwd
- search-grep match records > a file name holding ':N:' keeps its file, line and text
- search-grep secret paths (ROLES-CHAT-8) > ADMIN and local CLI still grep secrets, matching files-read
- search-grep secret paths (ROLES-CHAT-8) > non-admin explicit secret path is refused like files-read
- search-grep secret paths (ROLES-CHAT-8) > non-admin recursive search leaves every secret file out
- shell-exec SAFE-3 clamp checks the scripts a command runs (REQ-plugins-087) > unit: a shell reading commands from its input checks that input
- shell-exec SAFE-3 clamp checks the scripts a command runs (REQ-plugins-087) > unit: a sourced, shell-run or executed script that escapes refuses
- shell-exec SAFE-3 clamp checks the scripts a command runs (REQ-plugins-087) > unit: in-root scripts, programs and non-shell files stay allowed
- shell-exec SAFE-3 clamp checks the scripts a command runs (REQ-plugins-087) > unit: scripts the clamp cannot read or trust refuse
- shell-exec SAFE-3 clamp checks the scripts a command runs (REQ-plugins-087) > unit: trap actions and alias definitions are checked
- shell-exec SAFE-3 scripts end to end (REQ-plugins-087) > a script that would escape returns exit 2 with SAFE-3 and never spawns
- shell-exec SAFE-3 scripts end to end (REQ-plugins-087) > in-root scripts still run
- shell-exec spawn is bounded and scrubbed (REQ-plugins-495) > the calling run's abort kills a long command (exit 130)
- slash + schedule refuse an out-of-scope project (REQ-discord-202) > /work on an allowlisted sibling still runs in its own worktree
- startDaemon > stop after the grace kills an abandoned run's process tree (AGENT-3)
- stopping real process trees > killProcessTree stops the child, its group and a setsid grandchild
- stopping real process trees > SIGTERM snapshot lets a later kill reach grandchildren orphaned meanwhile
- task run interrupted by a signal (AGENT-3, REQ-cli-244) > a lane process that escaped the tree kill and holds the output pipe does not keep the run from exiting
- task run interrupted by a signal (AGENT-3, REQ-cli-244) > SIGINT during verify: cancelled result frame, exit 130, verify lane stopped
- task run interrupted by a signal (AGENT-3, REQ-cli-244) > SIGINT the run started with ignored (a background job) stays ignored; SIGTERM still cancels
- task run interrupted by a signal (AGENT-3, REQ-cli-244) > SIGTERM during verify: cancelled result frame, exit 130, verify lane stopped
- timeout / abort stop the plugin's whole tree (REQ-plugins-113 / 154) > the calling run's abort stops the tree (exit 130, aborted)
- timeout / abort stop the plugin's whole tree (REQ-plugins-113 / 154) > timeout kills the plugin, a same-group and a setsid grandchild
- tracked children die with their parent > a `once` shutdown handler registered first (bridge) is not cut short
- tracked children die with their parent > a parent started with SIGHUP ignored (nohup) survives SIGHUP while tracking
- tracked children die with their parent > a parent started with SIGHUP ignored still ignores it after untracking
- tracked children die with their parent > a parent that handles SIGTERM itself keeps its grace; exit still kills
- tracked children die with their parent > parent exit kills what an exited child left in its group (exit snapshot)
- worktree manager (SESSION-WORKTREE-1/3/5) > default branch 'trunk': branch with commits survives cleanup, clean branch is deleted

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-318` | `tests/web.search.test.ts` | Registration (dangerous, minTier 1), catalog only when allowlisted and never at read tier, SAFE-1 deny + SAFE-5 rows, role gate at `runPlugin`; the Brave request (host, path, `q` / `count` / `safesearch=moderate` / `freshness`, key only in `X-Subscription-Token`, pinned address); usage errors, `not-configured`, SAFE-6 query refusal with nothing sent; fenced hostile hits, count cap, dropped URLs, `(no results)`; the key and the request URL never in any result, error or audit row, a split key never rebuilt (scrub last); Brave error mapping (403 included); abort, unexpected-failure and `--query` usage cases; the owner's own schedule is offered it, a team member's schedule is not. Fails on the base source. |
| `REQ-plugins-3181` | `tests/web.search.test.ts` | http / other host / port / credentials refused before DNS; non-public answers refused before connecting; every redirect refused after one dial, Location not echoed; content type, encoding, byte cap, JSON validity, timeout, abort; network / TLS / DNS failures name the host and a fixed reason only; web-fetch unchanged for any public host. New module (cannot load on main). |
| `REQ-plugins-111` | `tests/web.fetch.test.ts`, `tests/web.search.test.ts` | "registered as a typed builtin" now expects `web-search` to exist as its own command; web-fetch keeps its fixed headers for any public host and every other web-fetch test passes unchanged. Fails on the base source. |
| `REQ-plugins-065` | `tests/roles.team.test.ts`, `tests/web.search.test.ts` | `roleAllowsPlugin` over every plugin with `TEAM_SEARCH_TOOLS` (`web-search` only); the team catalog offers `web-search` (allowlisted) and not `web-fetch`, community never; a community role session is refused at `runPlugin`, a team one reaches the handler. Fails on the base source. |
| `REQ-plugins-113` | `tests/web.search.test.ts` | `fledgeChildEnv` drops `BRAVE_SEARCH_API_KEY` and keeps `PATH`. Fails on the base source. |
| `REQ-agent-002` | `tests/web.search.test.ts`, `tests/agent.verify-env.test.ts` | `isVerifyEnvDropped` / `buildVerifyEnv` drop `BRAVE_SEARCH_API_KEY`; the existing verify-env tests pass unchanged. Fails on the base source. |
| `REQ-agent-117` | `tests/web.search.test.ts`, `tests/autonomous.delegate.test.ts` | `isWorkerEnvDropped` and `buildDelegateSpawn` drop `BRAVE_SEARCH_API_KEY` (no value anywhere in the spawn); existing delegate env tests pass. Fails on the base source. |
| `REQ-agent-071` | `tests/web.search.test.ts`, `tests/safe.injection.test.ts` | `web-search` is in `INJECTION_SCAN_TOOLS`; through `createTaskExecute` an injected description notes the tool message, drops `web-search`, `web-fetch` and `files-write` from the next request, refuses the write, reports one notice and ends the summary with the note; the existing SAFE-13 tests pass. Fails on the base source. |
| `REQ-agent-086` | `tests/agent.loop-guards.test.ts` | Every dangerous or mutating builtin, `web-search` included, is in exactly one of `STATE_CHANGING_TOOLS` / `NO_STATE_CHANGE_TOOLS` (`web-search` in the second). Fails on the base source's sets once `web-search` is registered. |
| `REQ-agent-318` | `tests/web.search.test.ts` | "a reply whose run used web-search ends with 'Search by Brave' …": the map holds only `web-search`; answered searches (two, and a retry) end the reply with the line once and no model request contains it; no line with no search, no key, a 429 or a refused query; a team member's reply carries it; a spend-cap stop after a search shows `SPEND_CAP_SUMMARY` and the line while the ask's question and the owner's stop DM never do; `closingNotesTail`, `chatBodyFromTaskResult`, `resultFrame` and `planAnswerParts` keep it at the end. Fails on the base source. |
| `REQ-agent-098` | `tests/web.search.test.ts`, `tests/agent.spend-ask.test.ts`, `tests/agent.spend.test.ts` | With only `CORVIDINHO_PROVIDER_SPEND_CAPS_USD` set a search is recorded and sent, and a setting that is not valid stops it (SAFE-14); no cap opens no DB; reserve 5000 micro-USD before the request, settle `actual` / `failed` 0 / `estimated` (network, timeout, unreadable 2xx, abort after sending), no row for a run already stopped; at the cap, with an invalid value and with an unavailable ledger nothing is sent and `spendAsk` carries the ask; in the tool loop the attempt ends with `SPEND_CAP_SUMMARY` and the ask after one model call; the existing spend tests pass. Fails on the base source. |
| `REQ-discord-417` | `tests/web.search.test.ts` | `redactSecretEnvValues` and `formatErrorLine` redact the `BRAVE_SEARCH_API_KEY` value. Fails on the base source. |
| `REQ-cli-262` | `tests/preload.operator-data-dir.test.ts` | A child `bun test` started with `BRAVE_SEARCH_API_KEY` set sees none of the run settings (the probe lists the key). Fails on the base source. |

## Where these lessons go

- `specs/plugins/context.md`
- `specs/agent/context.md`
- `specs/discord/context.md`
- `specs/cli/context.md`
