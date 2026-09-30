---
module: watch
change: on-github-people-match-only-by-their-numeric-user-id-a-renamed-or-re-registered-login-never-counts-as-the-owner-or-a
---

# Delta — watch (the sender is recognised by GitHub numeric user id only)

## Added

### REQUIREMENT REQ-watch-367

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

## Modified

### REQUIREMENT REQ-watch-036

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

### REQUIREMENT REQ-watch-071

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

### REQUIREMENT REQ-watch-067

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
