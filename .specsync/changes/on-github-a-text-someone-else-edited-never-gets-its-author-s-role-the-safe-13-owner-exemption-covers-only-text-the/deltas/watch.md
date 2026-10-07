---
module: watch
change: on-github-a-text-someone-else-edited-never-gets-its-author-s-role-the-safe-13-owner-exemption-covers-only-text-the
---

# Delta: watch (a text someone else edited never gets its author's role or identity; SAFE-13 exempts only what the owner wrote — IDENTITY-12.a follow-up to #374)

## Modified

### REQUIREMENT REQ-watch-1201

IDENTITY-12.a (#65, captured from Leif's 2026-09-28 interview, round 16):
"On GitHub, the owner and team members I've declared get their role's tools
too, behind the same must-ask gate; anyone else stays community." The WATCH
poller SHALL pass each run the declared role of the person who **triggered**
it, `watchTriggerRole(event, people)` (`src/watch/router.ts`), as
`AgentRunChatOpts.actingRole`:

- An `issue_comment`, `issues` (a body mention) or
  `pull_request_review_comment` event is triggered by its sender: the role is
  `roleOfPerson(resolvePerson(people, { githubId: senderId }))` in the
  owner's people list re-read for the event (IDENTITY-13/14) — the GitHub
  numeric user id the API reported, never the login and never a name
  (IDENTITY-7 / 7.a). No id, an undeclared id, a declared community person, or
  no people list ⇒ `community`.
- An `assignment` or `review_request` is triggered by its `actor` (who
  assigned or requested), whom the event names by login only, never by the
  thread author: it SHALL be `community`, whoever the author is.
- The spawn SHALL stamp that role (REQ-watch-008); the tool layer re-resolves
  it from the GitHub id at every call (REQ-plugins-1201), so the stamp only
  caps it.
- The identity block (`formatWatchIdentityBlock`) SHALL give a declared
  owner or team sender a role line: `- role: <owner|team> (this run has the
  <role>'s tools, behind the same must-ask gate as on Discord)` when the
  sender triggered the run, else `- role: <owner|team> (but this run was
  started by an assignment or review request, so it has community tools)`.
- Unchanged: the repo and user allowlist gate before any run (ALLOW-1/2,
  REQ-watch-302), the SAFE-12 fence on the thread's title and body for every
  role, the SAFE-13 owner exemption, the `watch` surface (no shell, runners
  or Fledge runs, SAFE-3.a, REQ-watch-735), the memory scope (REQ-watch-067).
  No env var, config key, flag, table or schema change.
- Since REQ-watch-1202 (follow-up to #374) the sender triggered the run only
  through text nobody else edited: `watchTriggerRole` SHALL give `community`
  unless `textUneditedByOthers(event)`, and the SAFE-13 owner exemption
  covers only text the owner wrote.

Acceptance Criteria
- Through `startWatchPoller`: comments by the owner's numeric id → `actingRole: "owner"` and the prompt's owner role line; by the team member's → `"team"`; by a declared community person, a stranger, the owner's login with another id and with no id → `"community"`, with no owner or team role line; the thread text is still fenced.
- An issue-body mention by the team member → `"team"`; an assignment and a review request on the owner's own thread → `"community"`, and the prompt says the run has community tools.
- `watchTriggerRole` gives owner / team by numeric id, community for a community person, a stranger, a re-registered login, no id, no people list and both actor-gated types.
- `tests/watch.github-roles.test.ts` fails on the base sources and passes on the branch.
- An owner comment or issue body someone else edited → `"community"` (REQ-watch-1202, `tests/watch.github-roles.postreview.test.ts`).

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

- Since REQ-watch-1202 (follow-up to #374) the owner exemption SHALL cover
  only text the owner wrote: the body when the owner sent it and nobody else
  edited it (`textUneditedByOthers`), the title when the owner opened the
  thread (`threadAuthorId`) and nobody else renamed it
  (`titleUnrenamedByOthers`); every other part is scanned.

Acceptance Criteria
- `routeEvent` puts the title and body inside the fence after the header; a 20 000-char body that guesses the end marker, and a body of lines that get quoted, both leave the real end marker last and the prompt within 8000 chars.
- `watchInjectionVerdict` flags a non-owner's injected body or title — including one from the owner's login with no or another numeric id — and returns null for the owner's (by numeric id) and for an ordinary body.
- Through `startWatchPoller` with a memory DB and the echo ack client: an injected comment runs nothing, gets one comment @mentioning the owner's GitHub login and one `injection-suspected` row with actor `github:<login>`; the next ordinary event runs with its body fenced.
- `buildSummaryBody` adds the owner line only when the run reports `injection`.
- Through `startWatchPoller`: an assignment event whose run reports `injection` gets one comment @mentioning the owner's login with the SAFE-13 line, and a second poll does not repeat it.
- Regression tests in `tests/safe.injection.test.ts` fail on the base sources and pass after.
- `watchInjectionVerdict` flags the owner's injected body when someone else edited it or its edits are unknown, and a title the owner did not write or someone else renamed (REQ-watch-1202, `tests/watch.github-roles.postreview.test.ts`).

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

- Since REQ-watch-1202 (follow-up to #374) the run SHALL act only for
  whoever triggered it (`watchActingGithub`): the commenter's login and id,
  and their profile block, only for a comment or body nobody else edited; an
  assignment or review request acts for its `actor`'s login alone (no
  profile); a text someone else edited, or whose edits could not be read,
  acts for nobody (empty keys, project block only).

Acceptance Criteria
- The WATCH spawn env carries the commenter's login, numeric id and the thread's repo over stale values, with no Discord actor and `CORVIDINHO_ACTING_IS_ADMIN=0`.
- Through `startWatchPoller` a declared commenter's prompt holds their profile rows relevant to the comment and the repo's project rows, never another person's; an undeclared commenter's holds only the project rows; `runChat` receives `actingGithubLogin`, `actingGithubId` and `repo`.
- `enrichWatchPromptWithMemories` leaves the prompt unchanged with no store, or for an undeclared commenter when the repo has no project rows.
- `tests/memory.recall-github.test.ts` and `tests/memory.rank.test.ts` cover each and fail on the stacked base sources.
- A commenter whose login is a declared person's or the owner's but whose numeric id is missing or different gets only the project block (`tests/watch.github-numeric-id.test.ts`).
- A comment someone else edited and an assignment get no profile block and no commenter id (REQ-watch-1202, `tests/watch.github-roles.postreview.test.ts`).

### REQUIREMENT REQ-watch-1016

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

- Since REQ-watch-1202 (follow-up to #374) a declared person's ask SHALL be
  recorded only when nobody else edited that comment or body
  (`textUneditedByOthers`); otherwise `recordWatchForgetMe` returns
  `edited`, records nothing, raises no card, and the reply says the text may
  have been edited by someone other than them.

Acceptance Criteria
- Through `startWatchPoller` a declared person's `@watch-user forget me` runs no model, records one pending ask (`github:4242:tofu-dev`, `github:<repo>#7`) with `memory-forget-request` `started` / `ok` as `github:tofu-dev`, posts one reply with the request id, and deletes nothing; after the owner approves on the bridge's card, the next poll posts "was approved" on that thread once (no count) and marks it told.
- An undeclared sender gets "not on the owner's people list" and no ask; a login-only declared person with another numeric id gets "can't confirm"; "don't forget me …", a quoted "forget me" and an assignment event are normal runs; a forget ask and another comment on the same issue both count; a Deny is posted as "did not approve".
- A WATCH run's kept conversation lists `github:<login>` and `github-id:<n>`.
- With two decided asks, a rate limit (429) on the first outcome post stops the pass (neither is posted); a locked thread (a bare 403) on the first does not: the second is posted and marked told, and the first once its thread takes the post.
- `tests/watch.forget-me.test.ts` covers each and fails on main.
- The owner's approval of a GitHub ask on the bridge's card takes Approve and the one-time code typed into the form (SAFE-19, REQ-discord-096); the thread reply and the outcome post are unchanged (`tests/watch.forget-me.test.ts`).
- An ask someone else edited, or whose edits are unknown, records nothing and gets the "edited by someone other than you" reply (REQ-watch-1202, `tests/watch.github-roles.postreview.test.ts`).

## Added

### REQUIREMENT REQ-watch-1202

IDENTITY-12.a follow-up to #374 (REQ-watch-1201, REQ-watch-071,
REQ-watch-067, REQ-watch-1016): GitHub keeps a comment's or an issue / PR
body's author as its `user` when someone with write access (or an Actions /
App token) edits it, so the sender triggered a run only through text nobody
else edited; and a thread's title is its author's only while nobody else
renamed it.

- The search clients SHALL carry, on each `issue_comment` and `issues`
  event, `DetectedEvent.textEditorIds`: the GitHub numeric user ids of
  everyone who edited the triggering text after it was posted (`[]` when
  never edited), read for every comment and body from
  `SearchClient.findTextEditors(nodeId)` (the live client: GraphQL
  `TEXT_EDITORS_QUERY` on the REST `node_id` — `lastEditedAt`, the last
  `editor`, and every `userContentEdits` revision's `editor` and
  `deletedBy` — parsed by `textEditorIdsFromNode`) and never inferred from
  REST `updated_at`, which is to the second, so an edit made in the second
  the text was posted would look like none. An editor or deleter with no
  numeric id, a history longer than was read, a failed lookup (a rate limit
  still bubbles) or a client with no lookup SHALL leave it absent (unknown).
  Every event SHALL carry `threadAuthorId`, the numeric id of the thread's
  author, when the API gave it, and `titleEditorIds`: who renamed the
  thread's title (`[]` when never renamed), read once per thread from
  `SearchClient.findTitleEditors(nodeId)` (the live client: GraphQL
  `TITLE_EDITORS_QUERY` on the thread's `node_id`, every
  `RenamedTitleEvent`'s actor, parsed by `titleEditorIdsFromNode`), absent
  under the same rules. `fetchWatchEvents` SHALL make these lookups only for
  the events its `needsLookup(id)` accepts (default: every event); the
  poller SHALL pass the ids it has not processed or denied, so a new event's
  lookups are made once, not at every poll, and a skipped event carries
  neither. The fixture client takes `editor_ids` on comments and
  `body_editor_ids` / `title_editor_ids` on items (default: never edited or
  renamed).
- `textUneditedByOthers(event)` (`src/watch/router.ts`) SHALL be true only
  when `senderId` and `textEditorIds` are known and every editor is
  `senderId`. `watchTriggerRole` SHALL give `community` when it is false
  (fail closed), and the identity block's role line for a declared owner or
  team sender SHALL then read `- role: <owner|team> (but someone else may
  have edited this text after they posted it, so this run has community
  tools)`. Editing one's own text keeps one's role.
- `watchInjectionVerdict` SHALL exempt only text the owner wrote (the owner
  by numeric id, REQ-watch-367): the body only when the owner sent it and
  `textUneditedByOthers` holds; the title only when `threadAuthorId` is the
  owner's and `titleUnrenamedByOthers(event)` holds (the renamers are known
  and every one is `threadAuthorId`). Every other part SHALL be scanned, so
  the owner's comment on a thread someone else opened, or renamed, has that
  title scanned.
- `watchActingGithub(event)` (`router.ts`) SHALL name whom a run acts for:
  a comment's or body's sender (login and numeric id) only when
  `textUneditedByOthers` holds; an assignment's or review request's `actor`
  by login only; otherwise nobody. The poller SHALL pass only that to
  `runChat` (`actingGithubLogin` / `actingGithubId`, so the spawn stamps the
  keys empty otherwise, REQ-watch-067) and as the commenter's id to the
  memory inject, so a text someone else edited, an assignment and a review
  request never put any person's profile in the prompt or let the run's
  memory plugins save or read one (MEMORY-8 / MEMORY-ACL-1), and their SAFE-5
  rows and must-ask requester are `github:(unknown)` or `github:<actor
  login>` (REQ-plugins-1203).
- `recordWatchForgetMe` SHALL record a declared person's "forget me" only
  when `textUneditedByOthers` holds; otherwise it SHALL return `edited`,
  record nothing and raise no card, and the one thread reply
  (`watchForgetMeReplyBody`) SHALL say the text may have been edited by
  someone other than them, so no forget request was made (MEMORY-ACL-6.a).
- No env var, config key, flag, table or schema change. A poll makes one
  GraphQL call per new mention comment or body mention and one per thread
  with a new event.

Acceptance Criteria
- Through `startWatchPoller` with the fixture client: the owner's comment edited by a stranger and the owner's issue body edited by a team member → `actingRole: "community"` with the "someone else may have edited" role line; the owner's unedited comment, self-edited comment and unedited body → `"owner"`.
- A failed edit lookup, or a client with no lookup, leaves `textEditorIds` absent and the role community.
- The live client over a stubbed `fetch`: every mention comment and body mention gets one GraphQL edit lookup and each thread one rename lookup; a stranger's revision gives `[stranger, owner]`, a text with no edits `[]`, a 502 leaves it absent; `threadAuthorId` is the item author's id. A comment edited in the second it was posted (REST `updated_at` equal to `created_at`) whose history shows a stranger's edit gives `[stranger, owner]`, community and a scanned body.
- Through the poller over three polls, one new comment costs one edit lookup and one rename lookup.
- `textEditorIdsFromNode`: `[]` for no edits; every editor and deleter; null for a missing editor id, a cut history or no node. `titleEditorIdsFromNode`: `[]` for no renames; every renamer; null for an actor with no id, a cut list or a node that is not a thread.
- `watchInjectionVerdict` flags the owner's injected comment when someone else edited it or its edits are unknown, an injected title unless the owner opened the thread, and the owner's title when a stranger (or the owner and a team member) renamed it or its renames are unknown; through the poller a stranger's injected title on the owner's comment, and a stranger's rename of the owner's thread title, are refused before any run while the owner's own (or own-renamed) thread runs as the owner.
- Through the poller with a row in the team member's profile: their unedited comment acts for them (login and id) with that row; their comment a stranger edited acts for nobody, and an assignment on their thread acts for the assigner's login only, both without the row; in the env each run is spawned with, `memory-store` saves only for the unedited one, and `auditContextFromEnv` gives `github:(unknown)`, `github:<assigner>` and `github:<their id>`.
- `recordWatchForgetMe` returns `edited` and records nothing for an ask someone else edited or whose edits are unknown, and `requested` for the person's own; the reply says it may have been edited by someone else and no request was made.
- `tests/watch.github-roles.postreview.test.ts` fails on the base sources and passes on the branch.
