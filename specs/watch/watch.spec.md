---
module: watch
version: 28
status: draft
files:
  - src/watch/types.ts
  - src/watch/config.ts
  - src/watch/dedup.ts
  - src/watch/searcher.ts
  - src/watch/router.ts
  - src/watch/session-store.ts
  - src/watch/agent-client.ts
  - src/watch/poller.ts
  - src/watch/ack.ts
  - src/watch/summary.ts
  - src/watch/spawn-log.ts
  - src/watch/rate-limit.ts
  - src/watch/index.ts
  - src/watch/memory-inject.ts
  - src/watch/forget-me.ts
  - tests/watch.forget-me.test.ts
  - src/watch/owner-ask.ts
  - tests/watch.stuck-ask.test.ts
  - tests/watch.auth-stop.test.ts
  - tests/watch.request-actor.test.ts
  - tests/watch.conversation.test.ts
  - tests/watch.github-numeric-id.test.ts
  - tests/watch.failed-comment.test.ts

db_tables: []
depends_on:
  - plugins
  - agent
  - cli
---

# Watch

## Purpose

Thin GitHub WATCH poll ingress: Octokit/fixture search → allowlist gate →
session stub for mention / issue_comment / review_request / assignment on
allowlisted targets (ALLOW-1). Assignment when watch username is in issue/PR
assignees (#48). Poll-first for bot/VM; webhook deferred. Reliability harden:
per-cycle poll logging, caught pollOnce errors, auto-ack GitHub comment on
mention/comment start/continue (skip own username; once per event id), ignore
own mentions in search, document org-search pagination bury risk; plus
WATCH-RELIABILITY-1..3 — post-run summary after successful auto-ack, durable
spawn outcome logging, and GitHub 403 rate-limit backoff. WATCH sessions
persist in the shared SQLite DB (`watch_sessions`, schema v6) with the same
soft TTL as Discord sessions (SESSION-1..3, REQ-watch-037). Memory in GitHub
runs (MEMORY-8/9, REQ-watch-067): the spawn passes the commenter's GitHub
login / numeric id and the thread's repo so the memory plugins act for the
commenter's declared person, matched by the numeric id only (REQ-watch-367;
undeclared: the repo's project memory, read-only), and before each run the poller searches the commenter's profile
and the repo's project memory for the comment and prepends what it found
(`src/watch/memory-inject.ts`). Forget from GitHub (MEMORY-ACL-6.a,
REQ-watch-1016): a clear "forget me" to the watch user never starts a run —
the poller matches the sender by GitHub numeric id, records a declared
person's ask for the owner's Discord Approve/Deny card, replies once on the
thread, and posts the outcome there once the owner decides
(`src/watch/forget-me.ts`). Stuck runs (AGENT-16.a, REQ-watch-086): a run that
ends with a "stuck" ask, on any event type, is handed to the Discord bridge
through the shared DB so the owner is pinged on Discord like other stuck asks
(`src/watch/owner-ask.ts`). Spend-cap stops (AUTONOMY-8, REQ-watch-099): a run
that ends stopped at a spend cap is handed over the same way, so the bridge
DMs the owner its details once per cap episode while GitHub shows only that
work is paused for budget.

## Public API

loadWatchConfig, startWatchPoller, routeEvent, SessionStore, goLiveChecklist,
NOT_AUTHORIZED, filterNewEvents, containsMention, DetectedEvent types,
SessionStore options (`db`, `ttlMs`, `now`; `durable`), startWatchPoller
`db` / `sessionStore` / `sessionTtlMs` injection; outside a dry run
`startWatchPoller` logs `[watch] <notice>` once at start when any tier has no
usable model provider (AGENT-10, REQ-watch-079; `providerNotice` from
`src/agent/providers.ts`),
ProcessedIdStore / AckedIdStore / SummarizedIdStore options (`db`, `maxSize`;
`durable`), agent helpers, createFixtureSearchClient / createOctokitSearchClient,
ack helpers (shouldAckEvent, buildAckBody, AckClient, AckedIdStore),
summary helpers (buildSummaryBody, maybePostWatchSummary, SummarizedIdStore,
SuccessfulAckStore), spawn-log helpers (SpawnOutcomeStore, classifySpawnError),
rate-limit helpers (parseGithubRateLimit, GithubRateLimitError,
computeRateLimitBackoffMs), `StartWatchResult.fatal` / `WatchFatal`
(REQ-watch-418). A failed `AckCommentResult` carries the HTTP `status` and the
rate-limit `headers` (`retry-after`, `x-ratelimit-remaining`,
`x-ratelimit-reset`) of the failed post; `maybePostWatchAck` /
`maybePostWatchSummary` take an optional `onPostFailed(res)` called after the
`ack failed` / `summary failed` line (REQ-watch-011). `gateEvent` /
`EventGateResult` (repo, author and, for assignment / review_request, actor
gates; REQ-watch-302); `DetectedEvent.actor`, `SearchClient.findRequestActor`,
`newestRequestActor`, fixture `assigners` / `review_requesters`
(REQ-watch-302).
`RouterDeps.people` (a `PeopleDirectory`), `formatWatchIdentityBlock(event,
people)` and `WATCH_IDENTITY_HEADER` (`router.ts`); `DetectedEvent.senderId`
and the search clients' `userId` (GitHub numeric id from the API's `user.id`;
fixture `user_id`) (REQ-watch-036) — the only thing any WATCH path matches a
sender on (IDENTITY-7.a, REQ-watch-367). `startWatchPoller` loads the owner from its allowlist file +
env and passes `loadDeclaredPeople` (re-read per event) to `routeEvent`, so a
declared commenter's prompt opens with a `[Corvidinho acting GitHub user …]`
paragraph (IDENTITY-14 / IDENTITY-7).
Untrusted text (SAFE-12 / SAFE-13, #71, REQ-watch-071): `router.ts` exports
`watchEventText(event)`, `watchInjectionVerdict(event, people)`,
`WATCH_BODY_FENCE_HEADER` and `WATCH_PROMPT_MAX_CHARS` (8000); `ack.ts`
exports `buildInjectionRefusalBody(reasons, ownerLogin?)` and
`postWatchInjectionRefusal(opts)`; `summary.ts` exports
`watchInjectionLine(injection, ownerLogin?)`, `buildSummaryBody(spawn,
ownerLogin?)` and `maybePostWatchSummary({ ownerLogin })`; the WATCH
`AgentSpawnResult` gains `injection?` (validated from the child's result
frame).

`AgentRunChatOpts.actingGithubLogin` / `actingGithubId` / `repo` (the
commenter and the thread's repo, set by the poller; the spawn stamps them as
`CORVIDINHO_ACTING_GITHUB_LOGIN` / `_ID` / `_REPO`) and
`src/watch/memory-inject.ts`: `enrichWatchPromptWithMemories(prompt, store,
{ event, people, limit? })`, `formatWatchMemoryBlock`,
`formatWatchProjectMemoryBlock`, `WATCH_MEMORY_INJECT_HEADER` /
`WATCH_MEMORY_INJECT_EMPTY` / `WATCH_PROJECT_MEMORY_INJECT_HEADER`,
`WATCH_MEMORY_INJECT_LIMIT`, `WATCH_MEMORY_ROW_MAX_CHARS` (MEMORY-8/9,
REQ-watch-067).

`WATCH_THREAD_HEADER` / `WATCH_THREAD_FOOTER` (`src/watch/poller.ts`) frame
an issue or PR thread's replayed conversation (REQ-watch-472); the retained
store and condensing are `src/store/conversation.ts` (REQ-discord-472).

`src/watch/forget-me.ts` (MEMORY-ACL-6.a, REQ-watch-1016):
`isWatchForgetMeRequest(event, mentionUsername)`,
`forgetSubjectForGithubId(people, githubId)`, `recordWatchForgetMe(opts)` →
`WatchForgetMeOutcome` (`requested` / `not_declared` / `unconfirmed` /
`no_owner` / `error`), `watchForgetMeReplyBody(login, outcome)`,
`handleWatchForgetMe(opts)`, `watchForgetOutcomeBody(req)`,
`deliverWatchForgetOutcomes(opts)`, `WATCH_FORGET_AUDIT_SURFACE`
(`watch:forget-me`).

`src/watch/owner-ask.ts` (AGENT-16.a, REQ-watch-086): `WatchOwnerAskStore`
(`record({ event, ask, now })` — stuck and spend-cap asks only
(`WATCH_OWNER_ASK_REASONS`, REQ-watch-099), one per thread, replaced —
`clear(repo, number)`, `pending()`, `claim(ask)`, `release(ask)`) over the
module-owned `watch_owner_asks` table (`ensureWatchOwnerAsks`, created on
first use, no schema version bump), `WatchOwnerAsk`, `threadUrl(repo, n)`,
`WATCH_OWNER_ASK_TTL_MS` (a day), `markBridgeRunning(db, runner?)` /
`clearBridgeRunning(db, runner)` / `bridgeRunning(db, isAlive?)`
(`schema_meta` key `BRIDGE_RUNNER_META_KEY`, `discord_bridge_runner`) and
`noteWatchRunAsk(opts)` → `WatchRunAskOutcome` (`none` / `queued` /
`no-bridge` / `not-sent`). `AgentSpawnResult` gains `ask?: HumanAsk` (the
spawn client validates the result frame's `ask` with `askFromUnknown`).
A run whose result frame reports model failovers (AGENT-11,
`modelFallbackFromUnknown`) makes the spawn client call its
`onModelFallback(hops, sessionId)` option, by default one
`[watch] llm.fallback: …` warn line (`warnWatchModelFallback`); the summary
comment keeps the run's closing `(model fallback: …)` note when it clips
(REQ-watch-080).

A failed run's reason (DISCORD-3.b's reason on GitHub, REQ-watch-009):
`AgentSpawnResult` gains `failureReason?` (the result frame's `error`,
`failureReasonFromUnknown`) and `stderrTail?` (a failed run's stderr end);
`summary.ts` exports `watchFailureReason(spawn, env?)` → the one plain line
(`failureReasonFor` from `src/discord/failure-reason.ts`), or null for a run
that did not fail or stopped on an ask of its own; `buildSummaryBody(spawn,
ownerLogin?, env?)` and `maybePostWatchSummary({ env })` take the watcher's
env for its no-provider fallback.

## Invariants

The spawn client runs `task run --here --task <prompt> --output ndjson`
(REQ-watch-006 / REQ-watch-073): the run works in the watcher's cwd and never
makes a worktree of its own (SESSION-WORKTREE-1.a, REQ-cli-122).

Empty github orgs+repos fail-start; empty users = deny-all for triggers;
allowlist BEFORE session spawn; assignment / review_request also gate the
user who assigned / requested (actor; missing actor refused, deny wins) in the
router and before the poller's per-issue dedupe; denied refuse quietly (no
session); processed-id
dedup; with a DB, processed / acked / summarized ids persist per kind in
`watch_event_ids` so a restart never replays a handled event id, and denied
ids are kept apart in memory so they never evict a handled id (REQ-watch-247);
no ProcessManager; no auto-merge; secrets out of repo; fixture tests
need no live webhook secrets; pollOnce errors logged not swallowed; own
watch-username comments/mentions skipped; auto-ack at most once per event id;
run summary at most once per event id and only after successful auto-ack;
the run-summary comment clips its SAFE-6 scrubbed summary to 1200 chars and
keeps a closing `(not allowed for your role)` note (REQ-watch-231,
REQ-watch-734);
spawn outcomes logged structurally and appended to durable JSONL; on a GitHub
403/429 rate-limit on the poll fetch, the auto-ack or the run-summary comment
back off via Retry-After/reset (default 60s) before the next poll cycle without
tight loop;
WATCH agent spawn clears `CORVIDINHO_ACTING_DISCORD_USER_ID` and sets
`CORVIDINHO_ACTING_IS_ADMIN=0` so GitHub runs never act as a Discord memory
user (REQ-watch-008), and always sets `CORVIDINHO_ACTING_SURFACE=watch`, so a
WATCH run is never offered the shell, runners or Fledge runs (SAFE-3.a,
REQ-watch-735). With a DB, WATCH sessions reload on restart; a session
idle past the soft TTL (`resolveSessionTtlMs`, 30–60m, default 45m) is dropped
and the next event on that issue starts fresh; one session per
`owner/repo#number`; stored topic is SAFE-6 scrubbed; dry-run without
`CORVIDINHO_DATA_DIR` stays in-memory; the poller closes a DB it opened on stop
only after the in-flight cycle ends (REQ-watch-037). With a DB, each run on
an issue or PR adds the event and the run's answer to that thread's retained
conversation (`conversation_threads`, surface `watch`, scrubbed, last 20
turns plus a condensed summary, participants the lowercased senders), and a
follow-up on the same issue or PR — also after the session's TTL — gets it
replayed in a `[Corvidinho earlier conversation on this GitHub issue or PR …]`
block ahead of the event, condensed at about 80% of the model's window with
the opening and latest request word for word; it is purged 30 days after its
last update (every poll cycle purges), a conversation DB failure is logged and
never stops the run, and another issue never sees it (REQ-watch-472). Poll cycles are
single-flight; after stop no further event is routed, acked, or spawned; one
failing event is logged and marked processed without aborting the cycle.
A GitHub 401 from a poll halts the loop (no re-arm), logs one line naming
`GITHUB_TOKEN / GH_TOKEN`, and settles `fatal` with exit code 1; the default
error sink prints one SAFE-6 scrubbed line per error, never the error object
(REQ-watch-418).
The event's title and body reach the model only inside an `UNTRUSTED_DATA`
fence, clipped before fencing so the whole prompt stays within
`WATCH_PROMPT_MAX_CHARS` and the end marker (random id) is always last; the
header line, `URL:` and any identity block stay outside it. Before any ack or
run, `watchInjectionVerdict` checks the title and body of every routed event
whose sender is not the owner (by the owner's GitHub numeric id in the people
list only; the owner's login with no or another id is checked, REQ-watch-367); a
hit counts `refused`, runs nothing, posts one `buildInjectionRefusalBody`
comment (any event type; skipped for the watch user's own events and an
already-answered id; @mentions the owner's GitHub login when configured),
appends an `injection-suspected` / `denied` audit row (actor
`github:<login>`, surface `watch:<session>`), logs `[watch] SAFE-13 refused
…` and reports `onAction` kind `injection_refused`; the event id is already
processed, so it is never retried. A run whose result carries `injection` gets
the `watchInjectionLine` (owner @mentioned) in its summary comment, or, when
no summary comment is posted (an event type WATCH does not ack, or no
successful ack), in one `maybePostWatchInjectionNotice` comment of its own,
once per event id (REQ-watch-071).
A clear "forget me" to the watch user (`isWatchForgetMeRequest`: an
issue_comment / issues / review-comment event, not the watch user's own, that
@mentions it outside quoted lines and says only that) that passed the
allowlist gates never starts a run and is taken out before the per-issue
dedupe; its id is marked processed first; a declared person matched by GitHub
numeric id only gets a `forget_requests` ask (SAFE-5 `memory-forget-request`
`started` first, fail closed) and every sender gets one reply on the thread;
nothing is deleted there; each cycle (after the rate-limit wait) posts the
outcome of decided GitHub asks on their thread while its repo is allowlisted,
stopping at the first rate-limited (or unanswered) post — a locked or deleted
thread holds up nobody else — and giving up a day after the decision; a
run's retained conversation also keeps the commenter's `github-id:<n>`
(REQ-watch-1016).
Every WATCH recognition of the sender — identity block, memory inject, memory
plugins, SAFE-13 owner exemption — uses `senderId` only, never `sender`; no id
or an undeclared id is community, never the owner (IDENTITY-7.a,
REQ-watch-367).
After every run (any event type, ackable or not), `noteWatchRunAsk` hands a
`stuck` ask or a `spend-cap` stop (its log line says `spend-cap stop` and the
owner's Discord DM, `AUTONOMY-8`, and names no amount) to the bridge: with an owner Discord id and a DB it is recorded in
`watch_owner_asks` (keyed by the thread, question SAFE-6 scrubbed and a
re-scrub target, a newer ask replacing it) and one log line says it is queued,
or — with no live bridge mark on the data dir — that the owner's Discord ping
could not be sent and waits for a bridge; with no owner Discord id or no DB
nothing is recorded and one line says it could not be sent. Any other outcome
(done, failed without an ask, a clarify ask) drops the thread's pending ask. The run summary comment is unchanged (it still carries
`Needs your input: …` where WATCH posts one); nothing new is posted on GitHub
(REQ-watch-086).
A failed run without an ask of its own (a non-zero exit, or a spawn that
threw) never posts its run summary: its comment carries only
`watchFailureReason` — the result's `error` (which model call failed: status
and host, never the provider's reply body; the no-provider notice; which
verify failed), else the tier's no-provider notice, else the stderr end, else
the exit code; SAFE-6 scrubbed, one line of at most 200 characters — the
poller logs `[watch] run failed (<repo>#<n> id=<id>, exit N): <reason>`, and
the thread's kept agent turn is that line; only the operator-only spawn JSONL
keeps the scrubbed summary (REQ-watch-009).

## Behavioral Examples

Allowlisted mention or assignment→start_session; same repo#number→continue_session;
non-allowlisted user/repo→refuse quiet; duplicate id→skip; missing token /
empty repos refuse start cleanly; poll cycle logs six counters; mention/comment
start/continue posts ack unless sender is watch username or already acked;
own-username comment omitted from events; after successful ack + spawn finish,
summary comment once per event id; spawn start/outcome log + JSONL row; 403
rate-limit on the fetch, the ack or the summary comment schedules backoff and
skips tight re-poll; a plain 403 on a comment logs the failure only. Poller restarted on the
same data dir continues the same issue session; issue idle past TTL →
start_session with a new id; a follow-up on the same issue (within 30 days)
gets the thread's earlier events and answers replayed ahead of the new event
(REQ-watch-472). A non-owner comment whose body claims to be the
owner and asks for the API keys → no run; one refusal comment @mentioning the
owner's GitHub login; an `injection-suspected` audit row (REQ-watch-071).
A declared person's `@watch-user forget me` → no run, one ask for the owner's
card, one reply "I've asked the owner…"; an undeclared sender's → "not on the
owner's people list", no ask; after the owner approves or denies, the next
poll posts the outcome on that thread once (REQ-watch-1016).
A comment from the owner's login re-registered by someone else (another
numeric id) → `declared_person: none`, no owner memory, and its injection is
refused like anyone's; the owner's own id → `role: owner` (REQ-watch-367).
An assignment whose run ends stuck on a repeated failing call → no GitHub
comment, one `watch_owner_asks` row for the thread, and the bridge DMs the
owner the question with the thread link; with no bridge running, one log line
says the Discord ping could not be sent (REQ-watch-086).
An issue comment whose run's model call answers 429 with the provider's org
name and request id in its body → the summary comment is `Failed (exit 1).`
and `The model call failed (429 Too Many Requests from <host>)`, with neither
the org name nor the request id, and the watcher logs `[watch] run failed
(…, exit 1): …` with that line (REQ-watch-009).
An issue comment whose run stops at a spend cap → the summary comment says
only "Work is paused for budget.", one `spend-cap` row for the thread, one
log line with no amount, and the bridge DMs the owner the stop's details once
per cap episode (REQ-watch-099).

## Error Cases

Missing token; missing mention username; empty repo allowlist; not authorized
(user/repo); already processed; GitHub 403 rate-limit backoff; GitHub 401
(bad or revoked token) stops the loop with exit 1; a non-owner title or body
that trips the SAFE-13 detector is refused with one comment and no run
(REQ-watch-071); a thread-conversation read, write or purge failure logs
`[watch] conversation … failed` and the run goes on without the replay or the
record (REQ-watch-472); a stuck run with no owner Discord id, no DB or no live
bridge logs that the owner's Discord ping could not be sent, and a failure to
record it is logged (scrubbed) and never stops the cycle (REQ-watch-086); a
failed run (a model call that failed, no provider, a failed verify, a crash or
a spawn that threw) posts one plain reason line, never the run's summary or a
provider's reply body (REQ-watch-009).

## Dependencies

src/allowlist/github.ts, @octokit/rest (live), agent `task run` (verify gate always on, AGENT-14),
src/store (shared SQLite DB, session TTL, SAFE-6 scrub).

## Change Log

WATCH poll-first thin (#19, 2026-09-26, corvid-agent): mention/review_request/issue_comment → allowlist → session stub; webhook deferred.

| 2026-09-26 | watch-github-mention-review-ingress-poll-first-thin-slice-issue-19-poll-octokit-search-for-allowlisted-repo-mentions: WATCH poll-first thin (#19) — mention/review_request/issue_comment → allowlist → session stub; webhook deferred |
| 2026-09-26 | fix-discord-watch-spawn-always-bun-invoke-ts-for-protocol-handshake-and-agent-client-parse-task-run-json-for-discord: WATCH spawn uses buildCorvidinhoArgv (bun for .ts) |
| 2026-09-26 | github-write-plugins-issue-48: WATCH assignment events from issue/PR assignees |
| 2026-09-26 | github-write-plugins-for-assign-work-comment-pr-dogfood-issue-48-dangerous-github-issue-create-comment-github-pr-create: GitHub write plugins + WATCH assignment ingress |
| 2026-09-26 | watch-reliability-poll-cycle-logging-error-catch-auto-ack-github-comment-on-start-continue-ignore-own-mentions-document: poll logging + error catch, auto-ack, ignore own mentions, pagination bury docs (REQ-watch-007) |
| 2026-09-26 | harden-memory-plugin-acl-memory-acl-1-4-safe-4-issue-59-follow-up-acting-discord-user-and-admin-come-only-from-bridge: Harden memory plugin ACL (MEMORY-ACL-1..4 / SAFE-4 / issue #59 follow-up): acting Discord user and ADMIN come only from bridge-set env never model argv (--user/--admin/--db refused); ADMIN re-checked at handler time against live admin config with empty=deny-all; include-deleted is ADMIN-only; forget/override become real two-phase with an HMAC confirm token confirmed from a different turn; Discord/WATCH spawns always overwrite acting env |
| 2026-09-26 | live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one: Live NDJSON event stream for bridges (issue #73, AGENT-8 / CLI-7 / DISCORD-3 / DISCORD-10): task run --output ndjson emits one versioned JSON object per line for StateChanged/Text/ToolCall(redacted argument summary)/ToolResult/VerifyResult, running token usage, and a final result line; Discord and WATCH spawn clients consume the stream and forward state/tool/tokens to onStatus; protocol version 1 to 2 |
| 2026-09-26 | watch-reliability-1-3-post-run-summary-comment-once-per-event-after-successful-auto-ack-persist-spawn-outcome-logging: WATCH-RELIABILITY-1..3 — post-run summary, spawn outcome JSONL, 403 rate-limit backoff; package 0.0.10 |
| 2026-09-26 | watch-durable-sessionstore-issue-37-slice-1-session-1-3-watch-sessions-keyed-by-owner-repo-number-persist-in-the-shared: WATCH durable SessionStore (issue #37 slice 1, SESSION-1..3): WATCH sessions keyed by owner/repo#number persist in the shared SQLite DB (schema v6 watch_sessions) with the same soft TTL as Discord; activity keeps the session, idle past TTL starts fresh, sessions reload on restart; github watch opens the shared DB (in-memory for dry-run without a data dir and tests); topic scrubbed per SAFE-6; turn persistence/replay and summaries stay follow-ups |
| 2026-09-26 | discord-and-watch-spawns-always-run-prove-before-done-agent-4-fledge-2-stop-passing-no-verify-empty-fileschanged-still: Discord and WATCH spawns always run prove-before-done (AGENT-4 / FLEDGE-2): stop passing --no-verify; empty filesChanged still skips verify; CLI --no-verify local opt-out only; package 0.0.13 (#85 slice) |
| 2026-09-26 | watch-run-summary-is-secret-scrubbed-before-the-thread-comment-and-spawn-log: WATCH run summary is secret-scrubbed before the thread comment and spawn log |
| 2026-09-26 | watch-handles-each-event-id-at-most-once-across-restarts-processed-acked-and-summarized-ids-persist-in-the-shared-db: WATCH handles each event id at most once across restarts: processed, acked and summarized ids persist in the shared DB and denied ids no longer evict handled ids |
| 2026-09-26 | watch-never-drops-or-skips-a-trusted-request-when-an-event-id-write-fails: WATCH never drops or skips a trusted request when an event-id write fails |
| 2026-09-26 | watch-listcomments-fetches-every-comment-inside-the-poll-window-so-an-mention-after-comment-50-on-a-long-issue-or-pr-is: WATCH listComments fetches every comment inside the poll window so an @mention after comment 50 on a long issue or PR is detected |
| 2026-09-26 | watch-listcomments-reads-page-1-plus-the-newest-pages-up-to-the-10-page-cap-so-a-flood-of-older-comments-cannot-hide: WATCH listComments reads page 1 plus the newest pages up to the 10-page cap so a flood of older comments cannot hide the newest mention |
| 2026-09-27 | clean-cli-errors-a-failing-command-prints-one-scrubbed-line-plus-a-hint-and-exits-non-zero-instead-of-a-stack-trace-or: Clean CLI errors: a failing command prints one scrubbed line plus a hint and exits non-zero instead of a stack trace or Bun crash footer; discord bridge login failure exits cleanly naming DISCORD_TOKEN; github watch stops with exit 1 on a GitHub 401 |
| 2026-09-27 | the-verify-gate-uses-the-run-s-real-git-working-tree-diff-not-only-the-files-tools-report-so-an-edit-made-outside-the: The verify gate uses the run's real git working-tree diff, not only the files tools report, so an edit made outside the file tools is verified before done (AGENT-4, #85) |
| 2026-09-27 | a-403-429-github-rate-limit-on-the-watch-auto-ack-or-run-summary-comment-sets-the-backoff-before-the-next-poll-cycle: A 403/429 GitHub rate limit on the WATCH auto-ack or run-summary comment sets the backoff before the next poll cycle (WATCH-RELIABILITY-3) |
| 2026-09-29 | declared-people-the-owner-declares-who-s-who-in-the-allowlist-file-corvidinho-recognises-the-owner-and-each-declared: Declared people: the owner declares who's who in the allowlist file, Corvidinho recognises the owner and each declared person on Discord and GitHub by stable ids only, and only the owner changes people and links with audited /admin people (IDENTITY-13/14/6/7, ADMIN-3.a, #36) |
| 2026-09-29 | memory-on-discord-and-github-filed-by-person-or-project-and-a-memory-search-before-i-don-t-know-a-github-watch-run: Memory on Discord and GitHub, filed by person or project, and a memory search before I don't know: a GitHub WATCH run saves and recalls for the commenter's declared person (people list, stable GitHub ids) with MEMORY-7 privacy while an undeclared commenter reads only the thread repo's project memory and saves nothing (REQ-watch-008 changed); a recall with a query is ranked by relevance then recency; the Discord and WATCH injects search memory for the message; the tool loop searches memory itself before a reply that says it doesn't know, costing a model call only when facts are found (MEMORY-8, MEMORY-9, #67) |
| 2026-09-29 | security-gate-tests-fail-when-the-gate-is-removed-safe-2-refuses-every-specs-path-github-deny-users-and-deny-orgs-win: Security gate tests fail when the gate is removed: SAFE-2 refuses every specs/ path, GitHub deny_users and deny_orgs win in WATCH and git-push, a community session is refused a private repo through the real visibility lookup, and the live DISCORD-8 requester check is exercised |
| 2026-09-29 | every-cap-on-the-way-to-a-post-keeps-the-closing-roles-chat-3-not-allowed-for-your-role-note-the-watch-summary-comment: Every cap on the way to a post keeps the closing ROLES-CHAT-3 (not allowed for your role) note: the WATCH summary comment, scheduled-run posts and run rows, /work and /session start answers, and the SAFE-8 80% warning append |
| 2026-09-29 | watch-assignment-and-review-request-events-also-pass-the-user-allowlist-on-the-user-who-assigned-or-requested-the-actor: WATCH assignment and review-request events also pass the user allowlist on the user who assigned or requested (the actor), not only the thread author; a missing, non-allowlisted or deny-listed actor is refused quietly with no session, ack or run (ALLOW-1/2/5) |
| 2026-09-29 | prompt-injection-hygiene-display-names-are-cleaned-before-the-model-sees-them-and-a-name-that-imitates-the-owner-or-a: Prompt-injection hygiene: display names are cleaned before the model sees them and a name that imitates the owner or a declared person is flagged, identity and role still only from declared ids (SAFE-11); a non-owner's chat, /session start and /work text, WATCH issue/PR/comment titles and bodies, and GitHub reader and guild-member tool results reach the model fenced as untrusted data, and the system prompt says such blocks never grant permission (SAFE-12); a conservative always-on detector refuses a non-owner message or WATCH event that looks like an injection attempt before any run with one short reply that tells the owner, and a tool result that trips it drops every mutating tool for the rest of the run and tells the owner on the answer, every hit audited (SAFE-13, #71) |
| 2026-09-29 | condense-long-chats-at-about-80-of-the-model-s-window-with-the-task-and-latest-instruction-pinned-resume-from-the: Condense long chats at about 80% of the model's window with the task and latest instruction pinned, resume from the summary after the soft TTL, and keep each thread's summary 30 days (SESSION-5/6, SESSION-3.a, AGENT-6.a; #72) |
| 2026-09-30 | forget-from-github-and-from-admin-approved-on-the-card-a-declared-person-matched-by-github-numeric-id-who-comments: Forget from GitHub and from /admin, approved on the card: a declared person (matched by GitHub numeric id) who comments 'forget me' to the watch user raises the owner's existing Approve/Deny forget card with no model run and gets a reply on the thread (an undeclared sender is told nothing is kept, no card), the outcome is posted on that thread; the owner can start a forget for any declared person with owner-only, SAFE-5 audited /admin people forget, the same card; either way nothing is forgotten until the owner approves, and Approve also deletes the person's kept WATCH conversations by the GitHub login and numeric id the ask came from, never the owner who started it (MEMORY-ACL-6.a, #101) |
| 2026-09-30 | verification-can-t-be-skipped-and-the-real-diff-since-the-talk-started-decides-what-changed-agent-14-agent-15-agent-15: Verification can't be skipped and the real diff since the talk started decides what changed (AGENT-14, AGENT-15, AGENT-15.a): task run refuses --no-verify, [corvidinho] verify_before_complete is ignored, filesChanged comes from the real git diff alone (a claimed path git does not show still runs the lane), and a talk worktree whose last run did not end verified verifies from the talk branch's merge-base |
| 2026-09-30 | on-github-people-match-only-by-their-numeric-user-id-a-renamed-or-re-registered-login-never-counts-as-the-owner-or-a: On GitHub people match only by their numeric user id: a renamed or re-registered login never counts as the owner or a declared person on WATCH (prompt, memory scope, SAFE-13 exemption); [owner] github_id declares the owner's id; /admin people link github stores the looked-up numeric id; doctor warns about logins without an id (IDENTITY-7.a, #36) |
| 2026-09-30 | when-it-repeats-a-failing-call-it-is-steered-to-change-approach-then-asks-a-stuck-github-run-pings-the-owner-on-discord: When it repeats a failing call it is steered to change approach, then asks; a stuck GitHub run pings the owner on Discord (AGENT-16, AGENT-16.a) |
| 2026-09-30 | one-approve-deny-dm-card-engine-for-everything-that-needs-the-owner-s-ok-exact-action-target-and-amount-one-line-each: One Approve/Deny DM card engine for everything that needs the owner's OK: exact action, target and amount one line each with a diff or text sent first as verbatim quoted-data parts and buttons last, never cut; destructive and money cards also need a one-time code DMed apart and typed into a form, valid once, only for that card and action, for 2 minutes; no answer, a late answer or a gone waiter is a no; the engine's own poll delivers with the scheduler off; the forget card becomes its destructive 'forget' kind; schema v14 approval_requests / approval_codes (SAFE-18/19/20, #96) |
| 2026-09-30 | i-configure-the-models-openai-compatible-ollama-anthropic-with-no-built-in-default-and-it-says-so-when-none-is-set: I configure the models (OpenAI-compatible, Ollama, Anthropic) with no built-in default, and it says so when none is set (AGENT-13, AGENT-10) |
| 2026-09-30 | if-a-model-fails-or-is-retired-it-falls-back-to-my-next-configured-model-and-tells-me-agent-11: If a model fails or is retired it falls back to my next configured model and tells me (AGENT-11) |
| 2026-09-30 | owner-chat-session-start-and-work-may-use-the-allowlisted-shell-runners-and-fledge-runs-only-in-that-talk-s-own: Owner chat, /session start and /work may use the allowlisted shell, runners and Fledge runs only in that talk's own worktree; non-owners, WATCH, schedules, workers and the local CLI never get them (SAFE-3.a) |
| 2026-09-30 | a-cli-task-run-in-a-git-repo-works-in-its-own-worktree-by-default-here-runs-it-in-my-checkout-session-worktree-1-a: A CLI task run in a git repo works in its own worktree by default; --here runs it in my checkout (SESSION-WORKTREE-1.a) |
| 2026-09-30 | a-call-whose-price-is-unknown-stops-and-asks-on-the-owner-s-spend-card-showing-the-amount-as-unknown-when-a-cap-covers: A call whose price is unknown stops and asks on the owner's spend card showing the amount as unknown when a cap covers it (recorded unknown, owner lines read $X + unknown, no price override), and every surface asks before spending over a cap: WATCH spend-cap stops reach the owner by DM and a schedule's spend-cap stop can go on through the card (SAFE-16, SAFE-16.a, AUTONOMY-8) |
| 2026-10-01 | a-failed-github-watch-run-s-comment-says-why-in-one-plain-line-which-model-call-failed-status-and-host-never-the: A failed GitHub WATCH run's comment says why in one plain line (which model call failed: status and host), never the provider's raw error body; REQ-cli-079 matches what a daemon no-provider schedule run now records |
