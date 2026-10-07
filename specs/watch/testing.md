---
module: watch
---

# Testing

- `tests/watch.router.test.ts` — allow/deny/continue; `deny_users` and `deny_orgs` win over allow lists that name the user / repo, no session; assignment / review_request also gate the actor (`actor_not_allowlisted`) (REQ-watch-302)
- `tests/watch.config.test.ts` — fail-start + expand repos
- `tests/watch.poller.test.ts` — fixture searcher + poll cycles + dedup; assignment / review_request by a non-allowlisted, missing or deny-listed actor on an allowlisted author's thread → refused, no session / ack / run, and never shadows a trusted comment (REQ-watch-302)
- `tests/watch.request-actor.test.ts` — actor of the newest matching `assigned` / `review_requested` issue event over a stubbed transport (last page read, 500 → none, rate limit bubbles) and `newestRequestActor` (REQ-watch-302)
- `tests/watch.cli.test.ts` — missing token clean exit; help lists watch
- `tests/watch.session-store.durable.test.ts` — schema v6, durable reload, soft TTL keep-alive/expiry, one session per issue, SAFE-6 topic scrub, poller restart continuity, stop halts mid-cycle, single-flight cycles, per-event failure isolation, second-watcher row replacement (REQ-watch-037)
- `tests/watch.dedup-durable.test.ts` — handled ids survive a poller restart (no second run/ack/summary), a 2000-id stranger flood cannot evict a handled trusted id, a failed id write leaves the event for the next cycle (even when a retry would succeed), a failed acked/summarized write after the comment still runs the agent once, durable per-kind id stores (REQ-watch-247)
- `tests/watch.conversation.test.ts` — a follow-up on the same issue replays the earlier event and answer ahead of the new event (another issue and the first event get no block; Planning skips it); past the session's TTL it still replays, after 30 days it is purged; with a 1024-token window a long thread stays under 80% with the opening and latest request whole; a 7000+-char opening event prompt replays whole (its fence header marked `(quoted)`, SAFE-12); stored turns scrubbed, participants the lowercased senders, forgetting a commenter's login deletes the thread (REQ-watch-472)

## Rate limit on the ack or summary comment (REQ-watch-011 modified, WATCH-RELIABILITY-3)

- `tests/watch.reliability.test.ts` › "WATCH-RELIABILITY-3 rate limit on the
  auto-ack or run-summary comment" — the real Octokit ack client over a
  stubbed GitHub transport (no network, no live token): a failed post keeps
  its status and only the rate-limit headers, and a successful post returns the
  same result as before; a 403 `retry-after: 90` on the ack sets a 90 s
  backoff (backoff line after `ack failed`), the agent still runs once with no
  summary, a pollOnce inside the backoff skips the fetch and the failed ack is
  not retried after it; with the poll loop on, a 403 `retry-after: 600` on
  the ack keeps the loop from polling again until the 600 s have passed (not
  after one normal interval);
  `x-ratelimit-remaining: 0` + `x-ratelimit-reset` on
  the summary backs off until the reset (reason `x-ratelimit-reset`); a
  rate-limit message with no headers uses the 60 s default; a plain 403 on the
  ack or the summary sets no backoff.

## Run-summary comment keeps the closing role note (REQ-watch-734, ROLES-CHAT-3)

- `tests/watch.summary-scrub.test.ts` › "a long summary is clipped before its
  note, after the scrub; one without a note is clipped as before": the
  1529-char `chatBodyFromTaskResult` of a summary ending with the note gives a
  1200-char preview ending with the note right before the `---` footer; a
  GitHub token straddling where the note makes room leaves no `ghp_` prefix
  and the note is kept; a 1500-char summary without the note is clipped to its
  first 1200 chars as before. With `origin/main`'s `src/watch/summary.ts` the
  test fails; the file's other tests pass either way.

## Declared commenters (REQ-watch-036, IDENTITY-14 / IDENTITY-7)

- `tests/identity.recognise.test.ts` › "GitHub WATCH recognises declared
  people" — `routeEvent` with `people`: the leading `[Corvidinho acting GitHub
  user …]` paragraph (dropped by `planningSelectionText`), renamed login by
  numeric id, reused login or a login with no id refused, owner by `[owner]
  github_id` (the `[owner]` login alone is `declared_person: none`), strangers
  `declared_person: none`, prompt unchanged with nobody declared; fixture
  searcher carries `user_id` to `senderId`; `startWatchPoller` re-reads people
  from its allowlist file per event.

## Untrusted text on WATCH (REQ-watch-071, SAFE-12/13)

- `tests/safe.injection.test.ts` › "WATCH fences the title and body …":
  `routeEvent` puts the title and body inside an `UNTRUSTED_DATA` fence after
  the `[WATCH …]` header; a 20 000-char body that guesses the end marker is
  clipped so the real end marker is last and the prompt stays within 8000
  chars. › "SAFE-13 on WATCH": `watchInjectionVerdict` flags a non-owner body
  or title and skips the owner's; through `startWatchPoller` an injected
  comment runs nothing, posts one refusal comment @mentioning the owner's
  GitHub login and audits one `injection-suspected` row (actor
  `github:<login>`); the next ordinary event runs with its body fenced;
  `buildSummaryBody` adds the owner line only when the run reports
  `injection`; an assignment event (no ack, no summary) whose run reports
  `injection` still gets one comment @mentioning the owner, not repeated on
  the next poll.

## Memory in GitHub runs (REQ-watch-067 / REQ-watch-008, MEMORY-8 / MEMORY-9)

- `tests/memory.recall-github.test.ts` › "REQ-watch-008 / REQ-watch-067 spawn
  env" — the WATCH spawn stamps the commenter's login, numeric id and the
  thread's repo over stale values, with an empty Discord actor and
  `CORVIDINHO_ACTING_IS_ADMIN=0`; › "WATCH poller searches memory for the
  comment" — through `startWatchPoller` with an injected DB, a declared
  commenter's prompt holds their profile row and the repo's project row and
  never another person's, an undeclared commenter's holds only the project
  row, and `runChat` gets `actingGithubLogin` / `actingGithubId` / `repo`.
- `tests/memory.rank.test.ts` › "enrichWatchPromptWithMemories" — declared:
  the block (empty one-liner when nothing is stored); undeclared with no
  project rows or no store: prompt unchanged; the project block names the
  repo; long rows are clipped at `WATCH_MEMORY_ROW_MAX_CHARS`.
- `tests/memory.spawn-env.test.ts` › "WATCH spawn clears the acting env" still
  holds (no Discord actor, no confirm tokens, non-ADMIN, non-interactive).

## Forget me from GitHub (REQ-watch-1016, MEMORY-ACL-6.a)

- `tests/watch.forget-me.test.ts` — through `startWatchPoller` (injected
  events, echo ack client, fake agent) on a data dir shared with
  `startBridge`: a declared person's `@corvid-agent forget me` (numeric id
  match) runs no model, records one pending ask (`github:<id>:<login>`,
  `github:<repo>#<n>`) with `memory-forget-request` started / ok as
  `github:<login>`, posts one reply with the request id and deletes nothing;
  the bridge's card names the GitHub asker and thread; after Approve and the
  owner's one-time code (SAFE-19, REQ-discord-096) the next poll posts "was
  approved" on the thread once (no count) and marks it told.
  A stranger gets "not on the owner's people list" and no ask; a login-only
  declared person with another id gets "can't confirm"; "don't forget me …",
  a quoted "forget me" and an assignment event are normal runs; a forget ask
  and another comment on the same issue both count; a run's kept thread lists
  `github-id:<n>`; a Deny is posted as "did not approve". A rate limit on an
  outcome post stops that cycle's outcome pass, but a locked thread (a bare
  403) does not hold up the next asks' outcomes. In a GitHub-shaped
  env `memory-forget-me` names the comment path and records nothing
  (REQ-plugins-1016).
## One verify gate (REQ-watch-006, REQ-watch-073, REQ-watch-085)

- `tests/agent.ndjson-spawn.test.ts`: the WATCH spawn argv has no
  `--no-verify`; the gate itself (no switch, real diff, "no changes" note) is
  covered by `tests/agent.loop.test.ts` and `tests/agent.verify-gate.test.ts`.
## GitHub numeric user id only (REQ-watch-367, IDENTITY-7.a)

- `tests/watch.github-numeric-id.test.ts` — the live Octokit search client
  (`createOctokitSearchClient`) over a stubbed GitHub transport (no token, no
  network): issue and comment events carry the API's `user.id` as
  `senderId`; a comment payload without one has none. On those live events a
  renamed login with a declared id is that person; the owner's login with no
  id or another id gets `declared_person: none`, no `role: owner`, no owner or
  person memory (`enrichWatchPromptWithMemories` `declared: false`) and is
  flagged by `watchInjectionVerdict`; the owner's own id is the owner and
  exempt. Through `startWatchPoller` with the live client: an injection comment
  from the owner's login with another id is refused before any run (one
  comment @mentioning the owner); an ordinary one runs as undeclared without
  the owner's memory; the owner's id runs with `role: owner` and the owner's
  memory.
- `tests/identity.recognise.test.ts`, `tests/safe.injection.test.ts`,
  `tests/memory.rank.test.ts` and `tests/memory.recall-github.test.ts` hold the
  numeric-id rule on the identity block, the SAFE-13 exemption and the memory
  scope.
- Fail on base: with the base sources (main 20a0f58) swapped in, the WATCH
  identity, memory and SAFE-13 cases fail (the owner's re-registered login is
  treated as the owner); the live mapping case passes on both (it pins the
  mapping the guard relies on).

## Stuck GitHub runs ping the owner on Discord (REQ-watch-086, AGENT-16.a)

`tests/watch.stuck-ask.test.ts` ("WATCH: …", "the WATCH spawn client …"):
the poller with injected events, a stub agent and an in-memory DB records a
stuck ask for an assignment (no GitHub post) and a review request (thread
URL), logs that the Discord ping could not be sent with no bridge mark and
that it is queued with a live one (the summary comment still carries the
question), drops it on a later run with no ask, never stores a clarify ask,
keeps it when a later spawn throws, stores nothing with no owner Discord id
(IDENTITY-3 line) or no DB; the bridge mark counts only a live process; the
stored question is scrubbed and a re-scrub target; the spawn client returns a
blocked result frame's `ask`.
- Fail on base: with the base's (5093b81) `src/watch/{poller,agent-client,types}.ts`
  and `src/store/scrub.ts` swapped in (the new module kept), every poller,
  spawn-client and scrub-target case fails (nothing recorded, no `ask`); the
  no-DB note and bridge-mark units pass on both.

## No provider at start (REQ-watch-079; AGENT-10)

`tests/agent.providers.test.ts` ("the WATCH poller prints the notice at
start …") — a non-dry-run poller with an injected agent and no model logs
`[watch] <notice>`; with a model, or in a dry run, no such line. Fails on the
base sources.

## Model fallback (REQ-watch-080; AGENT-11)

`tests/agent.fallback.test.ts` ("the WATCH spawn client logs one [watch]
llm.fallback warn line …") — a fake bin whose result frame reports a failover:
the WATCH client's summary keeps the closing `(model fallback: …)` note and
one `[watch] llm.fallback: gpt-5 failed (HTTP 404), fell back to gpt-4.1
(session w1)` warn line is logged. Fails on the base sources (no line).

## WATCH runs stamp the watch surface (REQ-watch-735; SAFE-3.a)

`tests/discord.safe3a-surface.test.ts` ("Discord: the caller's surface, else
empty; WATCH: always watch") — the WATCH spawn client sets
`CORVIDINHO_ACTING_SURFACE=watch` even when its own env carries another
value; `tests/agent.safe3a-gate.test.ts` and
`tests/agent.safe3a-owner-shell.test.ts` show `watch` (and a
`CORVIDINHO_WATCH_SESSION_ID` marker) never gets the shell.
- Fail on base: with the base's `src/watch/agent-client.ts` the stamp is
  unset and the test fails.

## The spawn client passes --here (REQ-watch-006 / REQ-watch-073 modified; SESSION-WORKTREE-1.a)

`tests/agent.ndjson-spawn.test.ts` (WATCH spawn client) and
`tests/cli.task-worktree.test.ts` › "Discord and WATCH clients spawn task
run --here" — the fake bin records exactly `task run --here --task <prompt>
--output ndjson`. Fail on base: both fail (no `--here`).
## Spend-cap stops reach the owner (REQ-watch-099, REQ-watch-086 modified; AUTONOMY-8)

`tests/spend.surfaces.test.ts` ("WATCH: a run stopped at a spend cap is
handed to the bridge …") — the poller (injected event, stub agent ending
with a `spend-cap` ask, echo ack client, in-memory DB with a live bridge
mark) records one `spend-cap` row whose question keeps `Stopped at cap:
total.`, logs `[watch] spend-cap stop CorvidLabs/Corvidinho#7 id=comment-1:
queued for the owner's Discord DM (AUTONOMY-8)` with no amount, and posts
only "Work is paused for budget." in its summary comment; `noteWatchRunAsk`
gives `not-sent` / `no-owner` and `no-bridge` with lines naming no amount, and
a later run with no ask drops the row; for an event with no summary comment
the no-bridge line says no comment on GitHub carries it (never that GitHub
shows the pause). `tests/watch.stuck-ask.test.ts` passes unchanged (a
clarify ask still never records one).
- Fail on base: `noteWatchRunAsk` drops every non-stuck ask, so no row is
  recorded and the three tests fail.

## Turn cap note on the run-summary comment (REQ-watch-125, AGENT-12)

`tests/agent.limits.test.ts` ("WATCH: …"): the spawn client keeps
`stopReason`; the comment has the prose, a blank line and `TURN_CAP_NOTE`,
no `stopped=`; an idle-timed-out spawn (exit 1, `error` the stop line) gives
`failureReason` the stop line and its comment is `Failed (exit 1).` with that
one line (REQ-watch-009), no summary and no turn-cap line; a failed
turn-capped run shows its reason line without the note; a plain run has none.
Fail on base.

## A failed run's comment says why in one plain line (REQ-watch-009, REQ-watch-472, REQ-watch-080 modified; DISCORD-3.b's reason on GitHub)

`tests/watch.failed-comment.test.ts` (7 tests, 8 with the host case below; `startWatchPoller` with the
echo ack client and an in-memory DB, stub agents, and the real `task run`
through the WATCH spawn client against a localhost model that answers 429
with an org name and a request id in its body; no network, no real key):

- End to end: the summary comment is exactly `Corvidinho WATCH run summary —
  Failed (exit 1).`, `The model call failed (429 Too Many Requests)` and the
  footer (no host, below); no comment or log line has the org name, the
  request id or `LLM HTTP`; `[watch] run failed (CorvidLabs/Corvidinho#42
  id=…, exit 1): The model call failed (429 Too Many Requests from
  127.0.0.1:<port>)` is logged; the thread's kept agent turn is the comment's
  line; the operator-only spawn log's `summaryPreview` keeps `LLM HTTP 429: …`
  (scrubbed).
- No result `error`: a crash's scrubbed stderr end (`…/x.ts`, the token
  `[redacted:github-token]`), else `The run failed (exit 2) without saying
  why`; never the provider body in the comment or the kept turn. A spawn that
  throws: its scrubbed one-line message in the comment and the log line (no
  exit code).
- Unchanged: a successful run's comment and kept turn are its summary and no
  `run failed` line is logged; a failed run with a stuck ask keeps its
  summary (`Needs your input: …`); a spend-cap stop keeps "Work is paused for
  budget.".
- `watchFailureReason` order (the result's `error`, the no-provider notice,
  the stderr end, the exit code; 130 interrupted; null on success or an ask)
  and `buildSummaryBody` keeping the SAFE-13 owner line and the footer.
- Updated for the new line: `tests/watch.summary-scrub.test.ts` (a model is
  configured in its env; the stderr-fallback case expects the scrubbed
  reason line, the 500-char straddle case checks a successful run's summary
  and a failed run's 200-char reason line, neither with `ghp_`) and
  `tests/watch.reliability.test.ts` (the failed run's comment has its reason,
  not "agent blew up").
- Fail on main: with main's `src/watch/{agent-client,poller,summary,types}.ts`
  swapped in the file does not load (`watchFailureReason` is missing); with a
  stub export added so it loads, 5 of 7 fail (the end-to-end comment is `LLM
  HTTP 429: {"error":{"message":"Rate limit reached … in organization
  org-acme-widgets-7731 …"},"request_id":"req_7f3c9a1b2d4e5f60"}`); the two
  unchanged-behaviour cases pass. Restored: 7 pass.

## A failed run's public line drops the provider's host (REQ-watch-009, REQ-watch-472 modified)

`tests/watch.failed-comment.test.ts` (8 tests):

- End to end (the real `task run` against a localhost model answering 429):
  the comment's line is `The model call failed (429 Too Many Requests)` and no
  comment has the host `127.0.0.1:<port>`; the `[watch] run failed` log line
  keeps `… from 127.0.0.1:<port>)`; the kept agent turn is the comment's line
  and the stored turns never hold the host.
- `buildSummaryBody` with a reason naming `acme-prod.openai.azure.com`: the
  body's line is `The model call failed (429 Too Many Requests)`, the SAFE-13
  owner line and the footer kept.
- `watchPublicFailureLine` over `modelCallFailedLine` for a host of
  `acme-prod.openai.azure.com:8443` (through `failureReasonFor`, as the
  comment reads it): an HTTP status (429, and 599 with no status name), a
  timeout, a network error, a malformed reply and no failure detail each lose
  the host; a 266-char host the 200-char cap cut (`…`) is dropped too; the
  no-key line, the no-provider notice, a verify line, a stderr line and the
  exit-code lines come back unchanged.
- Fail on the branch head before this change (58c327f): with its
  `src/watch/{summary,poller}.ts` swapped in the file does not load
  (`watchPublicFailureLine` is missing); with a pass-through stub export
  added, 3 of 8 fail (the end-to-end comment is `The model call failed (429
  Too Many Requests from 127.0.0.1:<port>)`, the `buildSummaryBody` line names
  `acme-prod.openai.azure.com`, the shapes keep the host). Restored: 8 pass.


## Roles on GitHub (REQ-watch-1201 added, REQ-watch-008 modified; IDENTITY-12.a)

- `tests/watch.github-roles.test.ts` — temp allowlist file (owner with a
  `github_id`, a team and a community person with `github_ids`), temp data
  dir, a real `startWatchPoller` with a capturing agent, the real WATCH spawn
  client over a fake bin that dumps its env, a registered mutating must-ask
  test command; no token, no network.
  - "the poller stamps the role of whoever triggered the run": comments by
    the owner's id → `actingRole: owner` and the prompt's role line says the
    run has the owner's tools behind the must-ask gate; the team member's →
    `team`; declared community, a stranger, the owner's login with another id
    and with no id → `community`; the thread text stays fenced. An issue-body
    mention is its author's; an assignment or review request on the owner's
    own thread (a team member assigned) → `community`, and the role line says
    it has community tools. `watchTriggerRole` by numeric id only.
  - "the WATCH spawn stamps that role exactly like a Discord run": owner →
    `CORVIDINHO_ACTING_IS_ADMIN=1`, `CORVIDINHO_ACTING_ROLE=owner`, team →
    `0` / `team`, omitted or community → `0` / `community`; always
    `CORVIDINHO_ACTING_WORK_TASK=0`, surface `watch`, no Discord actor,
    whatever the watcher's env holds.
  - The tool-layer, must-ask and WATCH-limit cases are listed under the
    plugins module (REQ-plugins-1201).
- `tests/identity.recognise.test.ts` (updated): the owner's WATCH role line
  is now `- role: owner (this run has the owner's tools, behind the same
  must-ask gate as on Discord)`.
- Fail on base (`origin/main` e1a24ed): with its `src/plugins/roles.ts`,
  `src/watch/{agent-client,router,poller}.ts` and
  `plugins/files/protectedPaths.ts` swapped in, 9 of 12 fail (every poller,
  spawn, tool-layer, must-ask and secret-path case); the 3 that pass are
  regression guards (a Discord run ignores the GitHub keys; team and
  community never reach a card; no shell and community workers on WATCH).
  Restored: 12 of 12 pass.

## github watch re-reads the allowlist every poll (REQ-watch-043 added, ADMIN-3.c part 1)

- `tests/watch.allowlist-reload.test.ts` — temp allowlist file, in-memory
  DB, a real `startWatchPoller` (dry run, `runLoop: false`) with injected
  events and a capturing agent; `/admin` changes are made the way the bridge
  makes them (`planAdminListChange` + `commitAdminListChange` on its own
  loaded allowlist); no token, no network.
  - `/admin github add repo:` → the next cycle polls the new repo (same
    `repos` array, same `allowlist` object) and runs its event; `/admin deny
    add github_user:` → that user's next event is refused.
  - `/admin deny add github_user:<numeric id>` → that sender's events are
    refused by their id (`senderId`), a renamed login included; another id
    with an allowlisted login still runs.
  - A file that fails to load → `allowlistSkip: "unreadable"`, no fetch, no
    run, lists unchanged; fixed → polls again with the file's deny list.
  - The last repo removed → `allowlistSkip: "empty"`, nothing fetched; an org
    added → polls `corvidlabs/*` again.
  - A sender not on `[github].users` stays refused quietly while the lists
    are unchanged and runs after the file adds them (denied ids forgotten).
  - IDENTITY-12.a after a reload: the owner's comment runs as `owner`, a
    stranger's as `community`.
- Fail on base (`origin/main` 54d6a6c, same sources swapped in as the
  discord evidence): 5 of 5 fail; restored, 5 of 5 pass. Review follow-up:
  with the PR's first-round `src/watch/router.ts` swapped in, the numeric-id
  case fails (the event gate matched `deny_users` against the login only);
  restored, 6 of 6 pass.

