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
