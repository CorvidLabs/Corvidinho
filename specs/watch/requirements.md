---
module: watch
---

# Requirements

### REQ-watch-001

The system SHALL document poll-first for bot/VM deploy and webhook when a public URL is available. Thin slice ships poll only.

Acceptance Criteria
- docs/WATCH.md + STATUS state the choice explicitly.

### REQ-watch-002

The poller SHALL map allowlisted mention / issue_comment / review_request events to session stubs (start or continue by owner/repo#number) via typed Octokit or an injectable search client.

Acceptance Criteria
- Fixture events → start_session / continue_session; no shell `gh`.

### REQ-watch-003

Every event SHALL pass repo + user allowlist gates before session spawn (ALLOW-1/2). Denied contacts SHALL refuse quietly with no session (ALLOW-5).

Acceptance Criteria
- Non-allowlisted user/repo → kind refuse/ignore; SessionStore unchanged.
- A user on `deny_users` is refused (`user_not_allowlisted`, the not-authorized reply) even when the user allow list also names them, and no session starts; an allowlisted user who is not denied still starts one.
- A repo whose owner is on `deny_orgs` is refused (`repo_not_allowlisted`) even when the repo allow list names it, and no session starts.
- Both deny tests fail when the matching deny check is removed from `isGithubUserAllowed` / `isRepoAllowed`.

### REQ-watch-004

Start SHALL fail cleanly when token, mention username, or github repo allowlist is missing/empty. Secrets stay out of repo.

Acceptance Criteria
- loadWatchConfig / CLI exit non-zero with go-live checklist.

### REQ-watch-005

Processed event ids SHALL be deduplicated. No ProcessManager; no auto-merge in this slice. CI fixture tests require no live webhook secrets.

Acceptance Criteria
- Second pass with same ids does not spawn; bun test green offline.



### REQ-watch-006

WATCH `createSpawnAgentClient` SHALL spawn via `buildCorvidinhoArgv` so a
`.ts` corvidinho bin is always invoked with `bun` (never posix_spawn alone).
Spawns SHALL pass `--here` right after `task run`, so the run works in the
watcher's cwd and never makes a worktree of its own (REQ-cli-122).
Spawns SHALL NOT pass `--no-verify` (the flag is removed and refused,
REQ-cli-085) — prove-before-done (AGENT-4 / FLEDGE-2 / AGENT-14) always
applies to ingress runs; a run whose real diff is empty and that claimed no
change ends with "no changes, nothing to verify" inside the agent loop
(REQ-agent-003 / REQ-agent-085). Fixture tests SHALL cover argv shape.

Acceptance Criteria
- `.ts` → bun-prefixed argv; binary path unchanged when not `.ts`.
- Spawn argv is `task run --here --task <prompt> --output ndjson` with **no** `--no-verify`.
- No ProcessManager; allowlists unchanged.

### REQ-watch-048

WATCH SHALL emit an assignment DetectedEvent when the watch username appears in
issue/PR assignees from search results, using the same allowlist → session path
as mentions.

Acceptance Criteria
- Fixture with assignees includes assign-owner/repo#n event type assignment.

### REQ-watch-007

WATCH poll cycles SHALL log `fetched`, `new`, `started`, `continued`, `refused`,
and `skipped` counts each cycle. Errors from `pollOnce` SHALL be caught and
logged (not swallowed by fire-and-forget `void`). When the poller starts or
continues a session from an `issue_comment` or `issues` mention event whose
sender is not the watch username, it SHALL post a short GitHub issue comment
ack (with Made with Corvidinho attribution) at most once per event id.
`fetchWatchEvents` SHALL skip comments and issue-body mentions authored by the
watch username. Org/repo search MAY use `per_page` up to 100; docs SHALL note
that results beyond one page can bury non-primary-repo pings.

Acceptance Criteria
- Every successful poll cycle emits a log line with the six counters.
- Interval/immediate poll wrappers attach `.catch` and log failures.
- Ack skipped when sender === mentionUsername or event already acked.
- Ack only for issue_comment / issues on start_session / continue_session.
- Own-username comments/mentions absent from fetched events (fixture).
- docs/WATCH.md documents pagination bury risk; fixture tests need no live token.

### REQ-watch-008

The WATCH agent spawn SHALL clear `CORVIDINHO_ACTING_DISCORD_USER_ID` and
`CORVIDINHO_ACTING_CONFIRM_TOKENS`, set `CORVIDINHO_ACTING_IS_ADMIN=0`, and run
non-interactive (`CORVIDINHO_NON_INTERACTIVE=1`, SAFE-1). GitHub-originated runs have no Discord acting
user and SHALL NOT inherit a Discord identity from the watcher's environment.
Since #67 (MEMORY-8, Leif's 2026-09-28 interview) memory is no longer refused
in them: the spawn SHALL instead pass the commenter's GitHub login, numeric id
and the thread's repo (`CORVIDINHO_ACTING_GITHUB_LOGIN` / `_ID` / `_REPO`,
REQ-watch-067) and SHALL clear the Discord reply channel keys
(`CORVIDINHO_DISCORD_REPLY_CHANNEL_ID` / `_PARENT_CHANNEL_ID`), so the memory
plugins act for the commenter's declared person with MEMORY-7 privacy and give
an undeclared commenter community scope (REQ-plugins-067).

Acceptance Criteria
- WATCH spawn env has an empty acting user, no confirm tokens, `CORVIDINHO_ACTING_IS_ADMIN=0` and `CORVIDINHO_NON_INTERACTIVE=1` even when the parent env sets them.
- WATCH spawn env carries the commenter's `CORVIDINHO_ACTING_GITHUB_LOGIN` / `_ID` and the thread's `CORVIDINHO_ACTING_GITHUB_REPO` over any inherited value, and empty Discord reply channel keys.
- In a GitHub-shaped env a declared commenter's `memory-store` / `memory-recall` succeed on their own profile; an undeclared commenter's personal store and recall are refused.

### REQ-watch-037

WATCH sessions keyed by `owner/repo#number` SHALL persist in the shared
SQLite DB (`watch_sessions`) when the SessionStore is given a database, and
SHALL reload on restart so a follow-up on the same issue continues the same
session. The same soft TTL as Discord sessions (`resolveSessionTtlMs`,
SESSION-1..3) SHALL apply: activity within the TTL keeps the session; a
session idle past the TTL is dropped (memory and DB) and the next event on
that issue starts a fresh session; expired rows are dropped on load. At most
one session exists per issue key. The stored topic SHALL be SAFE-6 scrubbed.
`startWatchPoller` SHALL open the shared DB (in-memory for dry-run without
`CORVIDINHO_DATA_DIR`), accept an injected db or SessionStore, and close a DB
it opened on stop. Without a database the SessionStore stays in-memory.
The issue or PR thread's condensed conversation is kept apart from the
session and outlives its TTL (REQ-watch-472).

Acceptance Criteria
- A session created with a file DB is found by issue after reopening the DB.
- Activity within the TTL continues the session; idle past the TTL starts a new session and removes the old row.
- Expired rows are dropped when the store loads.
- A poller restarted on the same DB continues the same issue session.
- Stored topic has vendor-key-looking secrets redacted.
- A follow-up after the session's TTL starts a new session and still gets the thread's retained conversation replayed (REQ-watch-472).

### REQ-watch-073

The WATCH spawn agent client SHALL run
`task run --here --task <prompt> --output ndjson` (`--here`, REQ-cli-122), read stdout line by
line, forward live state / current tool / token totals to an optional
`onStatus` callback (AGENT-8), and take the summary from the stream's `result`
frame, falling back to `summarizeTaskRunOutput` when no result frame parses.
No new GitHub-visible surface is added.

Acceptance Criteria
- Fake-bin fixture printing ndjson drives the WATCH `onStatus` and returns the result-frame summary.
- Missing result frame falls back to `summarizeTaskRunOutput`.
- Spawn argv ends with `--output ndjson` (no `--json`) and has no `--no-verify`.
- Spawn argv is exactly `task run --here --task <prompt> --output ndjson` (REQ-cli-122).

### REQ-watch-009

The system SHALL post a short agent summary comment on the same GitHub thread when the agent run finishes (success or failure), after a successful auto-ack on issue_comment or issues start_session or continue_session, at most once per event id, with Made with Corvidinho attribution (WATCH-RELIABILITY-1).

A failed run without an ask of its own (a non-zero exit, or a spawn that
threw) SHALL say why in one plain line and SHALL NOT post its run summary,
which for a model failure is `LLM HTTP <status>: <provider body>` — the
provider's reply (account or org names, request ids, quota details), which
must never reach a public thread. Under `Corvidinho WATCH run summary —
Failed (exit N).` the comment SHALL carry `watchFailureReason(spawn, env)`
(`src/watch/summary.ts`), the same reason the Discord surfaces give
(`failureReasonFor`, `src/discord/failure-reason.ts`, REQ-discord-032):
the `task run` result's `error` (which model call failed and how —
`The model call failed (<status> <name> from <host>)`, never the provider's
reply body; the no-provider notice; which verify failed), which the WATCH
spawn client hands over as `AgentSpawnResult.failureReason`; else the
no-provider notice for the run's tier in the watcher's env; else the last
meaningful line of the run's stderr (`AgentSpawnResult.stderrTail`); else the exit code. A thrown
spawn's message stands in for the result's `error`. The line is SAFE-6
scrubbed first, stack frames and host paths are dropped, and it is at most
200 characters. On the thread a model-call line SHALL NOT name the
provider's host: `watchPublicFailureLine(reason)` (`src/watch/summary.ts`)
turns `The model call failed (<status> <name> from <host>)` into `The model
call failed (<status> <name>)`, and likewise drops the host of a timeout
(`The model call timed out`), a network error (`… (network error)`), a
malformed reply (`… (malformed reply)`), a call with no failure detail and a
host the 200-character cap cut; any other reason (the no-key line, the
no-provider notice, a stderr line, the exit-code line) is shown as it is. A
host can be the account's own resource name (`<resource>.openai.azure.com`),
a private gateway or an Ollama server's address; on Discord only the owner
sees it (REQ-discord-032), and this thread is public. The SAFE-13 owner line
and the footer follow as before. The poller SHALL log `[watch] run failed
(<owner/repo>#<n> id=<event id>, exit N): <reason>` with the host (no `, exit
N` for a spawn that threw) and keep the comment's line (no host) as the run's
agent turn in the thread's conversation (REQ-watch-472), so a later run never
replays a provider body or host to the model. The operator-only
spawn-outcome JSONL keeps the scrubbed run summary as `summaryPreview`
(REQ-watch-010, REQ-watch-231). A successful run's comment, a failed run that
stopped on an ask of its own (its summary carries `Needs your input: …`,
REQ-watch-086) and a spend-cap stop ("Work is paused for budget.",
SAFE-14.a, REQ-watch-099) are unchanged. No env var, config key or
GitHub-visible surface is added.

Acceptance Criteria
- Summary skipped when auto-ack did not succeed or event already summarized.
- Summary posted for both ok and non-zero exit runs.
- Fixture tests need no live GitHub token.
- Through `startWatchPoller` and the real `task run` against a localhost model that answers 429 with an org name and a request id, the summary comment is exactly `Corvidinho WATCH run summary — Failed (exit 1).`, `The model call failed (429 Too Many Requests)` and the footer; no comment has the host (`127.0.0.1:<port>`), and no comment or log line has the org name, the request id or `LLM HTTP`; the log has `[watch] run failed (CorvidLabs/Corvidinho#42 id=…, exit 1): The model call failed (429 Too Many Requests from 127.0.0.1:<port>)`; the thread's agent turn is the comment's line (no host); the spawn log's `summaryPreview` starts `LLM HTTP 429: `.
- `watchPublicFailureLine` over `modelCallFailedLine` for a host of `acme-prod.openai.azure.com:8443` gives `The model call failed (429 Too Many Requests)`, `(599)`, `The model call timed out`, `(network error)`, `(malformed reply)` and `The model call failed` (no failure detail), and drops a host the 200-character cap cut; the no-key line, the no-provider notice, a verify line, a stderr line and the exit-code lines come back unchanged.
- With no result `error` (and a model configured) a failed run's comment is its scrubbed stderr end (host paths cut, a token `[redacted:…]`), else `The run failed (exit N) without saying why`; a thrown spawn's comment and log line are its scrubbed one-line message with no exit code.
- A successful run's comment is unchanged; a failed run with a stuck ask keeps its summary with `Needs your input: …`; a spend-cap stop keeps "Work is paused for budget.".
- `tests/watch.failed-comment.test.ts` fails on main's `src/watch` sources and passes on the branch; its host cases also fail with the host kept on the thread.

### REQ-watch-010

The system SHALL persist spawn outcome logging (start, exit code or error class, duration_ms) via a structured watch spawn log line and a durable JSONL store under the Corvidinho data dir (override CORVIDINHO_WATCH_SPAWN_LOG) readable without Discord (WATCH-RELIABILITY-2).

Acceptance Criteria
- Start and outcome log lines emitted per spawn.
- JSONL append contains eventId, exitCode, errorClass, durationMs.
- Fixture or temp-dir tests cover store without live Discord.

### REQ-watch-011

The system SHALL back off on GitHub 403 rate-limit (or 429) using Retry-After or x-ratelimit-reset headers, else a documented default of 60s, before the next poll cycle; SHALL NOT tight-loop; SHALL emit a clear watch github rate-limit backoff log line (WATCH-RELIABILITY-3).
The backoff SHALL cover every GitHub call the poller makes: the poll fetch, the auto-ack comment and the run-summary comment. A failed comment post SHALL keep its HTTP status and rate-limit headers (`retry-after`, `x-ratelimit-remaining`, `x-ratelimit-reset`) so the same backoff applies. No env var, config key, CLI or slash command is added.

Acceptance Criteria
- Retry-After seconds preferred; else reset; else 60s default.
- While backoff outstanding, pollOnce skips fetch.
- Plain 403 without rate-limit signal does not trigger backoff.
- A 403/429 rate limit on the auto-ack or run-summary comment sets the same backoff (Retry-After, else x-ratelimit-reset, else 60s): the `[watch] github rate-limit backoff` line follows the `ack failed` / `summary failed` line, and a pollOnce inside the backoff skips the fetch.
- A plain 403 on the auto-ack or run-summary comment logs only `ack failed` / `summary failed` and sets no backoff.
- WATCH-RELIABILITY-1 unchanged: a rate-limited ack gets no summary, a failed ack or summary is not retried, and the agent run still happens once.

### REQ-watch-085

WATCH `createSpawnAgentClient` SHALL always hold ingress runs to the
prove-before-done gate (AGENT-4 / FLEDGE-2 / AGENT-14): spawn argv MUST NOT
include `--no-verify` (the flag is removed and refused, REQ-cli-085), and no
project `fledge.toml` key turns the gate off (REQ-agent-003). WATCH runs
reach the same gate as chat, schedules and `/work`. Same as Discord: the real
git diff decides what changed (AGENT-15), so a run that changed the git
working tree, or claimed a change git does not show, is verified before done
(REQ-agent-085), and a run whose real diff is empty and that claimed nothing
ends with "no changes, nothing to verify" (REQ-agent-003). Package
**0.0.13**. Fixture tests without live tokens.

Acceptance Criteria
- WATCH spawn argv never includes `--no-verify`.
- Package `0.0.13`; docs/WATCH.md updated.
- Fixture tests + SpecSync + fledge verify green.
- A run that changed the git working tree without a tool reporting it is verified before done; a run with an empty real diff and no tool claim ends with the "no changes, nothing to verify" note (REQ-agent-003 / REQ-agent-085).

### REQ-watch-231

The system SHALL pass the WATCH run summary through the SAFE-6 secret scrubber
(`scrubSecrets`) before posting it as the post-run summary comment on the
GitHub thread (REQ-watch-009) and before writing it as `summaryPreview` to the
durable spawn-outcome JSONL (REQ-watch-010). This applies whatever the summary
came from: the agent result frame, the stderr fallback, or a thrown spawn
error. The scrub SHALL run before the text is clipped to its length cap, so a
secret cut at the cap never leaks as a partial prefix. Text with no secret is
posted and logged unchanged (SAFE-6; AGENTS.md Secrets).

Acceptance Criteria
- A token-shaped value (e.g. `ghp_…`) in the agent summary, the stderr fallback or a spawn error is posted and logged as `[redacted:<kind>]`, never raw.
- A token that starts just before the 1200-char comment cap or the 240-char preview cap leaves no `ghp_` prefix in either sink.
- Fixture tests need no live GitHub token or network.

### REQ-watch-247

When `startWatchPoller` has a database (the shared Corvidinho DB it opens, or an
injected `db`), the processed, acked and summarized event-id sets SHALL persist
in that DB (table `watch_event_ids`, one namespace per kind), so a watcher
restarted on the same data dir SHALL NOT route, ack, spawn or summarize an
event id it already handled (REQ-watch-005 / REQ-watch-007 / REQ-watch-009 "at
most once per event id", WATCH-RELIABILITY-1). The durable sets SHALL NOT evict
by count. Ids of events refused by the allowlist gate (ALLOW-1 / ALLOW-5) SHALL
be kept in a separate in-memory set that never shares or evicts the handled
ids, so a flood of non-allowlisted mentions cannot make a handled trusted
request run again. Ids are marked before any ack or spawn; if that write fails,
the event SHALL be logged and left for the next cycle without aborting the
cycle (REQ-watch-037), and SHALL NOT be marked by a retry later in the same
cycle, since nothing ran for it. Only a failure before the id write (routing)
is marked processed, as REQ-watch-037 already requires. The acked and
summarized id writes that follow a posted comment SHALL be best-effort: a
failure is logged and SHALL NOT skip the agent run or the summary for an event
that was already acknowledged. Without a database the stores stay in-memory
with the existing FIFO cap. Rows hold event ids only, never free text.

Acceptance Criteria
- A second poller started on the same data dir with the same fetched comment reports `new=0`, spawns no agent, and posts no second ack or summary.
- After a handled trusted comment, a cycle with 2000 non-allowlisted mentions refuses all 2000, and the next cycle neither starts nor continues the trusted request.
- Processed, acked and summarized ids written through one DB handle are found (case-insensitively) through a new handle on the same file, and kinds do not leak into each other; a durable store is not FIFO-capped.
- If marking an id fails, the cycle completes, nothing runs for that event, and the next cycle handles it once, even when an immediate retry of the write would have succeeded.
- If the acked or summarized id write fails after the comment is posted, the failure is logged, the agent still runs once and the summary is still posted once.
- Fixture tests need no live GitHub token or network.
### REQ-watch-234

For each search hit, the live WATCH search client SHALL fetch the issue or PR
comments updated inside the same poll window that `fetchWatchEvents` uses
for search, by passing `since` to `issues.listComments` with
`per_page=100`, so an @mention from an allowlisted user is seen even when the
thread has more than 50 comments (REQ-watch-002 / ALLOW-1). Requests per
thread SHALL be capped at 10 pages. Because GitHub lists an issue's comments
oldest-first, when the window holds more pages than the cap the client SHALL
read page 1 plus the newest pages (located via the `Link` `rel="last"` page
number), so a flood of older comments inside the window cannot hide the newest
@mention; without `rel="last"` it MAY follow `rel="next"` up to the cap.
Comments last updated before the window SHALL NOT be fetched.
`SearchClient.listComments` SHALL take the window as an optional `since`; the
fixture client MAY ignore it. Allowlist, dedup, own-username skip and event
shapes are unchanged.

Acceptance Criteria
- On an issue with 60 comments where only #60 is new and mentions the watch username, `fetchWatchEvents` with `createOctokitSearchClient` returns an `issue_comment` event for #60; every comments request carries `since`.
- On a thread with 150 comments inside the window and the mention at #150, the client follows the second page and the mention is detected.
- On a thread with 1100 comments inside the window and the mention at #1100, the mention is detected with exactly 10 comments requests (page 1 and pages 3-11).
- Without `rel="last"`, the client follows `rel="next"` and stops at 10 requests.
- A mention in a comment last updated before the window produces no event.
- No new env vars or commands; fixture tests need no live token.

### REQ-watch-418

A GitHub 401 (bad or revoked token) SHALL stop the WATCH poll loop instead of
polling forever, and poll errors SHALL be one clear line (CLI-4, SAFE-6).
The 403/429 rate-limit backoff (WATCH-RELIABILITY-3) is unchanged.

- When a poll in the loop throws an error whose `status` (or
  `response.status`) is 401, the poller SHALL stop re-arming the loop, log one
  line `[watch] github auth failed (401): <line> — check GITHUB_TOKEN /
  GH_TOKEN; watch stopped` (`<line>` = `formatErrorLine`, REQ-discord-417),
  and settle `StartWatchResult.fatal` with `{ exitCode: 1, message }`.
  `fatal` SHALL never settle otherwise. A direct `pollOnce()` caller still
  gets the error thrown.
- The default error sink SHALL print `<msg>: <formatErrorLine(err)>` as one
  string and SHALL NOT pass the error object to `console.error`.
- Any other poll error keeps polling at the configured interval.

Acceptance Criteria
- A poll that throws an Octokit-shaped 401 settles `fatal` with `exitCode` 1 and the exact line above, the error sink receives only that line (no error object), the token value is absent, and a later `pollOnce()` fetches nothing.
- With the default sink, a poll that throws a 500 prints exactly one string `[watch] pollOnce error: <scrubbed first line>`.
- A 403 rate limit with `retry-after: 120` still backs off about 120 s and does not settle `fatal`.
- `corvidinho github watch` with a token GitHub rejects exits 1 by itself with that line and no `HttpError` dump.

### REQ-watch-734

The WATCH run-summary comment (REQ-watch-009) SHALL keep a summary's closing
ROLES-CHAT-3 note `\n\n(not allowed for your role)` (REQ-agent-333; WATCH
runs are non-ADMIN role sessions, REQ-watch-008) when it clips the summary to
its 1200-char cap: `buildSummaryBody` SHALL clip with `clipKeepingRoleNote`
(`src/agent/task-summary.ts`), so the text before the note loses its end and
the note stays last, right before the `---` attribution footer. The SAFE-6
scrub SHALL still run before the clip (REQ-watch-231). A summary that does not
end with the note SHALL be clipped exactly as before. No env var, config key
or flag.

Acceptance Criteria
- `tests/watch.summary-scrub.test.ts` "a long summary is clipped before its note, after the scrub; one without a note is clipped as before": a 1529-char summary ending with the note gives a 1200-char preview ending with the note before the footer; a token where the note makes room leaves no `ghp_` prefix; a 1500-char summary without the note keeps its first 1200 chars.
- With main's `src/watch/summary.ts` the test fails; it passes on the branch.

### REQ-watch-302

WATCH `assignment` and `review_request` events SHALL also pass the GitHub user allowlist gate on the user who assigned the watch user or requested its review (`actor`), not only on the thread author (`sender`), before any session spawn (ALLOW-1/2; extends REQ-watch-003). A missing, non-allowlisted or deny-listed actor SHALL be refused quietly with no session, no ack and no run (ALLOW-5).

- `gateEvent` (router) checks the repo, the author and, for these two types, the actor with `isGithubUserAllowed` (deny lists win, even over an allowlisted actor). A missing actor fails (fail closed). `routeEvent` refuses with `actor_not_allowlisted` and the not-authorized reply.
- The poller applies the same gate before the per-issue dedupe, so a refused assignment / review request is counted `refused`, gets no ack and no run, and never shadows a trusted comment on the same issue.
- `issue_comment` / `issues` mention events need no actor and are gated as before. The thread author stays `sender` (session user and prompt author); the actor is never swapped in for it.
- The search client's `findRequestActor` supplies `actor`. The Octokit client reads the issue's events (`issues.listEvents`, page 1 plus the newest pages up to the same 10-page cap as comments) and takes the newest `assigned` event whose `assignee` is the watch user (or `review_requested` event whose `requested_reviewer` is the watch user): its `assigner` (`review_requester`), else the event `actor`.
- No such event, no login, or a non-rate-limit API failure leaves `actor` unset (then refused). A 403/429 rate limit bubbles so the poll backs off (WATCH-RELIABILITY-3).
- The fixture client takes optional `assigners` / `review_requesters` maps keyed `owner/repo#n` (lowercase).
- Event ids (`assign-…`, `reviewreq-…`) are unchanged, so handled ids stored before this change still dedupe (REQ-watch-247). No env var, config key, flag, command or table is added.

Acceptance Criteria
- Router: for each of `assignment` / `review_request` on an allowlisted author's thread, a non-allowlisted actor, no actor, and an actor on `deny_users` (even when allowlisted) → refuse `actor_not_allowlisted`, not-authorized reply, SessionStore unchanged; an allowlisted actor → start_session with the author as session user; an allowlisted actor on a non-allowlisted author's thread → refuse `user_not_allowlisted`.
- Poller (fixture, `ALLOW_USERS=leif`, PR O/R#8 and issue O/R#9 by leif): actor `bob`, no actor, or `bob` allowlisted and on `DENY_USERS` → `started=0 refused=2`, no ack, no run, no session; actor `leif` → both start. A refused newer assignment does not shadow leif's trusted comment on O/R#9.
- Over a stubbed GitHub transport, an issue assigned to the watch user by `bob` (after an older assignment by `leif`) and a PR whose review `bob` requested give events with `sender` `leif` and `actor` `bob`; the newest assignment on the last of three event pages is the one read; a 500 on the events read leaves `actor` unset; a 403 with `x-ratelimit-remaining: 0` rejects with `GithubRateLimitError`.
- These tests fail on main's source.

### REQ-watch-036

WATCH SHALL recognise the owner and each declared person (IDENTITY-14,
REQ-discord-036) who triggers an event, by stable ids only (IDENTITY-7): the
commenter's GitHub numeric id (`DetectedEvent.senderId`, from the API's
`user.id` on search items and comments; the fixture search client reads
`user_id`) through `resolvePerson` — never the login (IDENTITY-7.a,
REQ-watch-367). `startWatchPoller` SHALL load
the owner (IDENTITY-1) from the allowlist file it loaded plus env, and pass
the declared people, re-read from that file for every routed event, to
`routeEvent` (`RouterDeps.people`), so edits apply without a restart. For a
resolved commenter the run prompt SHALL open with a separate paragraph headed
`[Corvidinho acting GitHub user …]` naming `github_login`, `declared_person`,
`display_name`, `nicknames` and, for the owner, `role: owner` (a GitHub run
still gets no ADMIN tools), before the `[WATCH …]` header; Planning ignores
that paragraph like the Discord identity block. Once anyone is declared, an
unresolved commenter SHALL get the block with `declared_person: none`; with
nobody declared (only the owner), an unresolved commenter whose login is the
owner's `[owner] github_login` SHALL get it too (REQ-watch-367), and for any
other unresolved commenter, or without `people`, the prompt SHALL be exactly
as before, apart from the SAFE-12 fence around the title and body
(REQ-watch-071). Allowlist gates, sessions,
acks and the spawn env (no Discord actor, non-ADMIN) are unchanged.

Acceptance Criteria
- A declared commenter's start prompt begins with the identity paragraph (`github_login`, `declared_person`, `display_name`, `nicknames`), then a blank line and `[WATCH issue_comment] …`; `planningSelectionText` drops it.
- A renamed login with the declared numeric id resolves; the declared login with a different numeric id, or with none, does not (`declared_person: none`).
- The owner is recognised by `[owner] github_id` with `role: owner`, never by the `[owner]` / env GitHub login; a commenter whose login equals a declared display name is not that person.
- With nobody declared, or without `people`, an unresolved commenter's prompt starts with `[WATCH`, unless (nobody declared) the commenter's login is the owner's, which gets `declared_person: none`.
- With only the owner configured, live events from the owner's login with no id or another id get `declared_person: none` and no `role: owner`, the owner's id gets `role: owner`, and another undeclared login gets no block (`tests/watch.github-numeric-id.test.ts`).
- The fixture search client carries `user_id` to `senderId` on comment events.
- `startWatchPoller` with an allowlist file recognises a declared commenter, and a person added to the file after start is recognised on the next event.
- Regression tests in `tests/identity.recognise.test.ts` fail on the base sources and pass after.
- With nobody declared, an unresolved commenter's prompt still starts with `[WATCH`; the title and body follow inside the `UNTRUSTED_DATA` fence (REQ-watch-071, `tests/safe.injection.test.ts`).

### REQ-watch-071

Untrusted GitHub text on WATCH (SAFE-12 / SAFE-13, #71). The event's title
and body (`watchEventText`) SHALL reach the model only inside an
`UNTRUSTED_DATA` fence (`source=github-thread`, header
`WATCH_BODY_FENCE_HEADER`) after the `[WATCH …]` header and `URL:` line, the
text clipped before fencing (and again by any overflow the fence adds) so the
whole prompt stays within `WATCH_PROMPT_MAX_CHARS` (8000) and the end marker
with its random id is always last. Before any ack or run the poller SHALL call
`watchInjectionVerdict(event, people)` for every routed event: null for the
owner (recognised by the owner's GitHub numeric id in the people list only,
never the login, REQ-watch-367) and for
text that does not trip `detectInjection`; on a hit the event SHALL count
`refused`, run nothing and get no ack, one comment
(`buildInjectionRefusalBody`: what WATCH won't do and why in plain words,
never the text, @mentioning the owner's GitHub login from `[owner]` / env when
set) posted by `postWatchInjectionRefusal` for any event type (skipped for the
watch user's own events, an already-answered id and a bad repo; the id joins
the acked store; a rate-limited post backs off like an ack), one
`injection-suspected` / `denied` SAFE-5 row (actor `github:<login>`, surface
`watch:<session>`, digest of the source and reasons; best effort), a
`[watch] SAFE-13 refused …` log line and `onAction` kind
`injection_refused`; the event id is already processed, so it is never
retried. The WATCH spawn client SHALL read the child's `result.injection`
(`injectionNoticeFromUnknown`) into `AgentSpawnResult.injection`, and the
run-summary comment SHALL then add `watchInjectionLine` (@mentioning the
owner's login when set); when no summary comment is posted for that run (an
event type WATCH does not ack, such as an assignment or review request, or no
successful ack), `maybePostWatchInjectionNotice` SHALL post one comment
(`buildInjectionNoticeBody`: the same line and the attribution footer) once
per event id (the summary dedup store; skipped for a bad repo; a rate-limited
post backs off like the summary). No env var, config key, table or column.

Acceptance Criteria
- `routeEvent` puts the title and body inside the fence after the header; a 20 000-char body that guesses the end marker, and a body of lines that get quoted, both leave the real end marker last and the prompt within 8000 chars.
- `watchInjectionVerdict` flags a non-owner's injected body or title — including one from the owner's login with no or another numeric id — and returns null for the owner's (by numeric id) and for an ordinary body.
- Through `startWatchPoller` with a memory DB and the echo ack client: an injected comment runs nothing, gets one comment @mentioning the owner's GitHub login and one `injection-suspected` row with actor `github:<login>`; the next ordinary event runs with its body fenced.
- `buildSummaryBody` adds the owner line only when the run reports `injection`.
- Through `startWatchPoller`: an assignment event whose run reports `injection` gets one comment @mentioning the owner's login with the SAFE-13 line, and a second poll does not repeat it.
- Regression tests in `tests/safe.injection.test.ts` fail on the base sources and pass after.

### REQ-watch-067

Memory in GitHub (WATCH) runs, filed by person or project, searched before
the run (MEMORY-8 / MEMORY-9, #67). For every started or continued run the
poller SHALL pass the commenter's GitHub login and numeric id from the GitHub
API event (`DetectedEvent.sender` / `senderId`; never a name from the
comment text) and the thread's `owner/repo` to `AgentClient.runChat`
(`actingGithubLogin` / `actingGithubId` / `repo`), and the spawn client
SHALL stamp them as `CORVIDINHO_ACTING_GITHUB_LOGIN` /
`CORVIDINHO_ACTING_GITHUB_ID` / `CORVIDINHO_ACTING_GITHUB_REPO` (always
overwritten, empty when unknown, never inherited from the watcher's env) so
the memory plugins act for the commenter (REQ-plugins-067).

Before the spawn, when the poller has the shared DB, it SHALL search memory
for the comment (`enrichWatchPromptWithMemories`, title + body as the query;
`recallRelevantThenRecent`: rows relevant to it first, ranked by relevance
then recency, then the newest, at most 20 per block) and prepend: for a
commenter whose GitHub numeric id resolves to a declared person in
the owner's people list re-read for the event (`memorySubjectForGithub`,
stable ids only, IDENTITY-7; the numeric id only, never the login,
IDENTITY-7.a, REQ-watch-367) a `[Corvidinho memory for this GitHub user …]`
block with that person's own profile (the same scopes as on Discord; the
configured owner not declared under `[people]` reads their Discord-id scope;
an empty profile gets a one-line nudge), never private notes and never anyone
else's rows (MEMORY-7); and, for anyone, a `[Corvidinho project memory …]`
block with the thread repo's project memory (`project:<owner/repo>`
lowercased, `projectScopeForRepo`) when it holds rows. An undeclared
commenter SHALL get only the project block. Rows longer than 1000 characters
are clipped. A failure SHALL be logged and the run spawned with the prompt
unchanged; an inject logs `[watch] memory inject: N recalled for @login`.

Acceptance Criteria
- The WATCH spawn env carries the commenter's login, numeric id and the thread's repo over stale values, with no Discord actor and `CORVIDINHO_ACTING_IS_ADMIN=0`.
- Through `startWatchPoller` a declared commenter's prompt holds their profile rows relevant to the comment and the repo's project rows, never another person's; an undeclared commenter's holds only the project rows; `runChat` receives `actingGithubLogin`, `actingGithubId` and `repo`.
- `enrichWatchPromptWithMemories` leaves the prompt unchanged with no store, or for an undeclared commenter when the repo has no project rows.
- `tests/memory.recall-github.test.ts` and `tests/memory.rank.test.ts` cover each and fail on the stacked base sources.
- A commenter whose login is a declared person's or the owner's but whose numeric id is missing or different gets only the project block (`tests/watch.github-numeric-id.test.ts`).

### REQ-watch-472

WATCH follow-ups SHALL pick up the issue or PR thread's summary (AGENT-6.a,
with SESSION-5; issue #72). With a database, `startWatchPoller` SHALL keep
one retained conversation per issue or PR in the shared
`conversation_threads` table (schema v13, REQ-discord-472): surface
`watch`, thread key `issue:<owner/repo lowercased>#<number>`, the thread's
first sender (lowercased GitHub login) as its person, and every sender whose
event ran as a participant (`github:<login>`).

After each run on an issue or PR (whether it succeeded, failed or threw),
the event's prompt (as a human turn) and the run's answer (as an agent turn:
its summary, or, for a failed run without an ask of its own, the one reason
line its comment shows, REQ-watch-009, never a provider's reply body or host) SHALL be
added to that thread's conversation, scrubbed (SAFE-6), its
turns bounded to the last 20 with the opening human turn kept and the rest
folded into the summary. A DB failure SHALL be logged and SHALL NOT stop
the run, the ack or the run-summary comment.

Before a run on an issue or PR that has a retained conversation — a
continued session or a new one after the session's soft TTL — the poller
SHALL put the conversation (its summary and kept turns, oldest first) in
one block opened by `WATCH_THREAD_HEADER`
(`[Corvidinho earlier conversation on this GitHub issue or PR — …]`) and
closed by `[End of earlier conversation]`, ahead of the new event's prompt,
with no blank line inside, so Planning module selection leaves it out
(REQ-agent-004). At about 80% of the model's window
(`CORVIDINHO_LLM_CONTEXT_TOKENS`, same budget as REQ-discord-472) the
oldest turns SHALL be folded into the summary, the thread's opening request
and its newest request kept word for word (a human turn is kept up to the
8000-char WATCH event prompt, so a whole event prompt is never clipped; its
own fence header is marked `(quoted)` like any block-like line, its fence
markers and fenced words unchanged, SAFE-12). The commenter's and project
memory blocks (REQ-watch-067) go ahead of this block. Another issue or PR never gets
it. A record SHALL be purged 30 days after its last update (every read and
write purges first, and every poll cycle purges), and forgetting a person
(`forgetConversations(db, { githubLogins })`, case-insensitive; an approved
forget-me of a declared person uses their linked GitHub logins,
REQ-discord-472) SHALL delete every thread they started or commented on. No GitHub-visible surface, env
var beyond the window, config key or CLI flag is added.

Acceptance Criteria
- A follow-up on the same issue gets the earlier event and answer replayed, oldest first, ahead of the new event; the first event and another issue get no block; `planningSelectionText` leaves the block out.
- Two hours later (past the session's TTL) the follow-up still gets it; 30 days after the last update it is purged and the next event gets no block.
- With a 1024-token window a long thread's prompt stays under the budget with the summary, the opening request and the latest request word for word.
- An opening event prompt of over 7000 chars replays whole (word for word, its fence header marked `(quoted)`) in the follow-up's block.
- The stored turns hold `[redacted:github-token]`, never the token; participants are the lowercased senders; forgetting a login that only commented deletes the thread.
- A failed run's kept agent turn is the reason line its comment shows (`The model call failed (429 Too Many Requests)`, no host), never the provider's reply body; a successful run's is its summary (`tests/watch.failed-comment.test.ts`).

### REQ-watch-1016

Someone known only on GitHub can ask there to be forgotten (MEMORY-ACL-6.a,
#101). After the repo, user and actor allowlist gates, the poller SHALL take
every event `isWatchForgetMeRequest` accepts out of the run path before the
per-issue dedupe, so it starts no session, ack or model run and never hides
another request on its issue: an `issue_comment`, `issues` or
`pull_request_review_comment` event, not from the watch user, that
@mentions the watch user outside quoted (`>`) lines and, with the mention,
punctuation and case dropped, says only "forget me" / "forget about me" or
"forget / delete / erase / remove everything / all / what (you know /
remember / have / keep / store (stored / kept)) about / of / on me", with at
most a greeting, please, can / could / would / will you, I want / would like
you to, and thanks. Anything else SHALL be a normal run.

For each such event the poller SHALL mark its id processed first (a failed
write leaves it for the next cycle), then (`handleWatchForgetMe`, never
throwing) match the sender in the owner's people list re-read now by their
GitHub numeric id only (`forgetSubjectForGithubId`, IDENTITY-7; a login
alone never counts; the owner's built-in entry reads the owner's Discord-id
scope). A declared person SHALL get one `forget_requests` ask
(`recordWatchForgetMe`: requester `github:<id>:<login>`, origin
`github:<owner/repo>#<n>`; SAFE-5 `memory-forget-request` `started` first,
actor `github:<login>`, surface `watch:forget-me` — no row ⇒ nothing
recorded — then `ok`, or `error` on a store failure; one open ask per
person) and nothing SHALL be deleted; the Discord bridge DMs the owner the
card (REQ-discord-1016), which the owner approves with Approve and the
one-time code (SAFE-19, REQ-discord-096). Every such event SHALL get one reply on its thread
(`watchForgetMeReplyBody`, attribution footer): the request went to the
owner (or is already waiting) and nothing is forgotten unless they approve
within 24 h; for a sender not on the list, that nothing is kept for them and
no request was made (no card); for a login on the list without a matching
account id, that it cannot be confirmed (no card); no owner or a recording
failure, that nothing was recorded. A failed post SHALL feed the rate-limit
backoff.

Each poll cycle with a DB SHALL, after the rate-limit wait and before the
fetch, post the outcome of each decided GitHub ask not yet told on its thread
(`deliverWatchForgetOutcomes`, `watchForgetOutcomeBody`: approved /
not approved / no answer in time, @mentioning the asker, never a count or any
content) while its repo is still allowlisted, marking it told; an ask whose
thread cannot be reached SHALL be given up a day after its decision; every
failed post SHALL feed the backoff, and the pass SHALL stop at the first post
that hits a rate limit or gets no HTTP answer, while any other failed post (a
locked or deleted thread) SHALL not hold up the next asks' outcomes; the pass
SHALL never throw. A run's retained conversation SHALL also keep the commenter's numeric
id as a participant (`github-id:<n>`), so a forget reaches a person declared
by GitHub id only.

Acceptance Criteria
- Through `startWatchPoller` a declared person's `@watch-user forget me` runs no model, records one pending ask (`github:4242:tofu-dev`, `github:<repo>#7`) with `memory-forget-request` `started` / `ok` as `github:tofu-dev`, posts one reply with the request id, and deletes nothing; after the owner approves on the bridge's card, the next poll posts "was approved" on that thread once (no count) and marks it told.
- An undeclared sender gets "not on the owner's people list" and no ask; a login-only declared person with another numeric id gets "can't confirm"; "don't forget me …", a quoted "forget me" and an assignment event are normal runs; a forget ask and another comment on the same issue both count; a Deny is posted as "did not approve".
- A WATCH run's kept conversation lists `github:<login>` and `github-id:<n>`.
- With two decided asks, a rate limit (429) on the first outcome post stops the pass (neither is posted); a locked thread (a bare 403) on the first does not: the second is posted and marked told, and the first once its thread takes the post.
- `tests/watch.forget-me.test.ts` covers each and fails on main.
- The owner's approval of a GitHub ask on the bridge's card takes Approve and the one-time code typed into the form (SAFE-19, REQ-discord-096); the thread reply and the outcome post are unchanged (`tests/watch.forget-me.test.ts`).

### REQ-watch-367

WATCH recognises GitHub users by numeric user id only (IDENTITY-7.a, #36,
REQ-discord-367). Every WATCH path that recognises the sender — the
`[Corvidinho acting GitHub user …]` identity block
(`formatWatchIdentityBlock`, REQ-watch-036), the memory inject
(`enrichWatchPromptWithMemories` → `memorySubjectForGithub`, REQ-watch-067),
the memory plugins in the run (REQ-plugins-067) and the SAFE-13 owner
exemption (`watchInjectionVerdict`, REQ-watch-071) — SHALL match
`DetectedEvent.senderId` (the API's numeric `user.id`) against the owner's
people list and SHALL NOT match `sender` (the login). An event with no
`senderId`, or one nobody declared, SHALL resolve undeclared (community): the
block says `declared_person: none` once anyone is declared, only the repo's
project memory is injected, and the SAFE-13 detector runs on it — never the
owner's exemption, block or memory — even when its login is the owner's
`[owner] github_login` or a declared person's login. `WATCH_IDENTITY_HEADER`
SHALL say the match is by GitHub numeric user id only. The live Octokit search
client (`createOctokitSearchClient`) SHALL map `user.id` to `userId` and so to
`senderId` on issue / PR items and comments (a payload without a numeric id
carries none), as the fixture client maps `user_id`. The login is still shown
(`github_login`), still gates the user allowlist (ALLOW-1/2), and is still the
@mention target and audit actor (`github:<login>`). No env var, config key,
table or column beyond REQ-discord-367.

Acceptance Criteria
- Through the live Octokit client over a stubbed GitHub transport: issue and comment events carry the API's numeric `user.id` as `senderId`; a comment payload without one has no `senderId`.
- On those live events: a renamed login with a declared id is that person; the owner's login with no id or another id gets `declared_person: none`, no `role: owner`, no owner or person memory, and is flagged by `watchInjectionVerdict`; the owner's own id is the owner and exempt.
- Through `startWatchPoller` with the live client: an injection comment from the owner's login with another id is refused before any run (one comment @mentioning the owner); an ordinary one runs as undeclared without the owner's memory; the owner's id runs with `role: owner` and the owner's memory.
- `tests/watch.github-numeric-id.test.ts` fails on the base sources and passes after.

### REQ-watch-086

When a GitHub run is stuck and needs me, it pings me on Discord like other
stuck asks (AGENT-16.a, captured with `hi` in this change from Leif's
2026-09-30 decision, interview round 13). The WATCH spawn client SHALL return
the result frame's `ask` as `AgentSpawnResult.ask`, validated and
re-normalized with `askFromUnknown`. After every run the poller starts, on
every event type (`issue_comment`, `issues`,
`pull_request_review_comment`, `assignment`, `review_request`: ackable
or not, summary comment posted or not), it SHALL call `noteWatchRunAsk`
(`src/watch/owner-ask.ts`, never throwing). A `stuck` ask (a repeated
failing call, REQ-agent-086, or verification failing after every retry,
AUTONOMY-2) SHALL be recorded, when an owner Discord id is configured and the
poller has its DB, in the module-owned `watch_owner_asks` table (created on
first use, no schema version bump): one row per issue or PR thread (id
`issue:<owner/repo>#<n>`, a newer ask replacing it) holding the repo, number,
event id and type, a GitHub link (the event's `htmlUrl` when it is a
`https://github.com/` URL, else `threadUrl`), the reason and the SAFE-6
scrubbed question (a `SCRUB_TARGETS` column). One log line SHALL then say
it is queued for the owner's Discord ping when a bridge marked itself running
on this data dir and its process is alive (`bridgeRunning`,
`schema_meta` `discord_bridge_runner`, the schedule runner liveness
check), else that the owner's Discord ping could not be sent because no
Discord bridge is running on this data dir, that it is sent if one starts
within a day, and whether the run summary comment carries the question. With
no owner Discord id or no DB nothing SHALL be recorded and one log line SHALL
say the ping could not be sent and why. A `spend-cap` stop SHALL be handed
over the same way (REQ-watch-099). Any other outcome on the thread (no ask,
a `clarify` ask) SHALL drop the thread's pending ask.
Nothing new SHALL be posted on GitHub; the run summary comment is unchanged
and carries `Needs your input: …` where WATCH posts one. The Discord side is
REQ-discord-086.

Acceptance Criteria
- An assignment whose run ends with a stuck ask posts nothing on GitHub, records one `watch_owner_asks` row (thread id, repo, number, event id and type, link, ask) and, with no bridge mark, logs `[watch] stuck ask <repo>#<n> id=<id>: the owner's Discord ping could not be sent — no Discord bridge is running on this data dir (CORVIDINHO_DATA_DIR); it is sent if one starts within a day; no comment on GitHub carries the question (AGENT-16.a)`.
- With a live bridge mark, an issue comment's stuck ask is recorded, the log says it is queued, and the run summary comment carries `Needs your input: <question>`.
- A review request's verify-exhausted stuck ask is recorded with the thread's own URL when the event has no GitHub link.
- A later run on the thread with no ask drops the pending row; a clarify ask never records one.
- No owner Discord id: nothing recorded, one log line naming IDENTITY-3; no DB: one log line, no throw.
- `bridgeRunning` is true only while the marked process runs (a dead pid's mark does not count); `clearBridgeRunning` removes only its own mark.
- The stored question is scrubbed on write, `watch_owner_asks.question` is in `SCRUB_TARGETS` and `rescrubDatabase` re-scrubs it; an ask other than stuck or spend-cap (REQ-watch-099) is never stored.
- The spawn client returns a blocked result frame's stuck ask as `ask`.

### REQ-watch-079

With no provider set, it says so at startup (AGENT-10, captured from Leif's
2026-09-28 interview). Outside a dry run, `startWatchPoller` SHALL log one
`[watch] <notice>` line at start when any tier has no usable model provider
(`providerNotice(env)`, REQ-agent-179), and nothing when every tier has one.
A dry run echoes and calls no model, so it SHALL NOT print the notice. WATCH
runs on a tier with no provider fail with the notice as their summary
(REQ-agent-179). No new env var, config key or GitHub-visible surface.

Acceptance Criteria
- A non-dry-run poller with an injected agent and no model logs `[watch] No model provider is configured: CORVIDINHO_LLM_MODEL is not set. …`; with `CORVIDINHO_LLM_MODEL=ollama:qwen3`, or in a dry run, no no-provider line.

### REQ-watch-080

If a model fails or is retired, it falls back to my next configured model and
tells me (AGENT-11, captured in `hi/agent.md` from Leif's 2026-09-28
interview; the chain is REQ-agent-080). The WATCH spawn client SHALL read the
result frame's `modelFallback` (`modelFallbackFromUnknown`, validated) and,
when a run failed over, call its `onModelFallback(hops, sessionId)` option, by
default one warn line `[watch] llm.fallback: <a> failed (<reason>), fell back
to <b>[; …] (session <id>)` (`warnWatchModelFallback`) — how the owner hears of
a failover in a commenter's run, besides the note; no DM. The run summary
comment of a run that still finished SHALL keep the run's closing
`(model fallback: …)` note when its 1800 cap clips a long summary
(`chatBodyFromTaskResult`, REQ-agent-080); a run that failed after failing
over posts its one reason line instead (REQ-watch-009), and the warn line
still names the failover. No env var or config key is added.

Acceptance Criteria
- A fake bin whose result frame reports `gpt-5` → `gpt-4.1` (HTTP 404): the WATCH client's summary ends with the note and `[watch] llm.fallback: gpt-5 failed (HTTP 404), fell back to gpt-4.1 (session w1)` is logged as a warning.

### REQ-watch-735

The WATCH spawn client SHALL always set `CORVIDINHO_ACTING_SURFACE=watch`
(overwriting any inherited value), so a WATCH run is never offered the
shell, the language runners or the Fledge core runs (SAFE-3.a,
REQ-agent-503), whatever the allowlist says; the agent's shell gate also
refuses any run whose env carries `CORVIDINHO_WATCH_SESSION_ID`. WATCH runs
stay non-ADMIN with no Discord actor (REQ-watch-008). No env var, config key
or flag is added.

Acceptance Criteria
- `tests/discord.safe3a-surface.test.ts` ("Discord: the caller's surface, else empty; WATCH: always watch"): the WATCH client's child sees `CORVIDINHO_ACTING_SURFACE=watch` even with `chat` in the watcher's env.
- `tests/agent.safe3a-gate.test.ts`: the owner's stamp in the own worktree with `CORVIDINHO_WATCH_SESSION_ID` set is refused ("WATCH runs never get them"), and a `watch` stamp is refused.
- With the base's `src/watch/agent-client.ts` the first test fails; it passes on the branch.

### REQ-watch-099

It asks before any spend that would go over a cap (AUTONOMY-8), on GitHub
too. A WATCH run that ends stopped at a spend cap — a `spend-cap` ask: no
owner to raise a spend card, a spend card that came to no (denied, or lapsed
because no bridge was running), an unpriced call whose card came to no, an
invalid cap setting or an unreadable ledger — SHALL be handed to the bridge
like a stuck ask (REQ-watch-086): `noteWatchRunAsk` SHALL record it in
`watch_owner_asks` (`WATCH_OWNER_ASK_REASONS`: `stuck` and `spend-cap`; one
row per thread, a newer ask replacing it, the question SAFE-6 scrubbed) when
an owner Discord id is configured and the poller has its DB, so the bridge
DMs the owner the stop's details (REQ-discord-199). Its log lines SHALL say
`spend-cap stop`, the owner's Discord DM and `AUTONOMY-8`, SHALL say that
GitHub shows only that work is paused for budget (SAFE-14.a) when the run
summary comment was posted, else that no comment on GitHub carries it, and
SHALL name no amount; the no-owner, no-DB and no-bridge variants are as for
stuck asks.
The run summary comment on GitHub stays the generic "Work is paused for
budget." (no amounts, caps, scopes or setting names). A later run on the
thread that is not stopped drops it.

Acceptance Criteria
- With a live bridge mark, an issue comment whose run ends with a spend-cap stop records one `spend-cap` row whose question keeps `Stopped at cap: total.`; the log line is `[watch] spend-cap stop CorvidLabs/Corvidinho#7 id=comment-1: queued for the owner's Discord DM (AUTONOMY-8)` with no `$` amount; the summary comment carries "Work is paused for budget." and no comment names an amount, `CORVIDINHO_DAILY` or the cap marker.
- No owner: `not-sent` / `no-owner`; no bridge: `no-bridge`, the log saying GitHub shows only that work is paused for budget, with no amount; a later run with no ask drops the row.
- An event with no summary comment (summary not posted): the no-bridge log says no comment on GitHub carries it and never that GitHub shows the pause, with no amount.
- These tests fail on main's sources (the stop is never recorded).

