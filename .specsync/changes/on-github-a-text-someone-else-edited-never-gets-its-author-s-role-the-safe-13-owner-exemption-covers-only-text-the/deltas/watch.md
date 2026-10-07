---
module: watch
change: on-github-a-text-someone-else-edited-never-gets-its-author-s-role-the-safe-13-owner-exemption-covers-only-text-the
---

# Delta: watch (a text someone else edited never gets its author's role; SAFE-13 exempts only what the owner wrote — IDENTITY-12.a follow-up to #374)

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
  thread (`threadAuthorId`); every other part is scanned.

Acceptance Criteria
- `routeEvent` puts the title and body inside the fence after the header; a 20 000-char body that guesses the end marker, and a body of lines that get quoted, both leave the real end marker last and the prompt within 8000 chars.
- `watchInjectionVerdict` flags a non-owner's injected body or title — including one from the owner's login with no or another numeric id — and returns null for the owner's (by numeric id) and for an ordinary body.
- Through `startWatchPoller` with a memory DB and the echo ack client: an injected comment runs nothing, gets one comment @mentioning the owner's GitHub login and one `injection-suspected` row with actor `github:<login>`; the next ordinary event runs with its body fenced.
- `buildSummaryBody` adds the owner line only when the run reports `injection`.
- Through `startWatchPoller`: an assignment event whose run reports `injection` gets one comment @mentioning the owner's login with the SAFE-13 line, and a second poll does not repeat it.
- Regression tests in `tests/safe.injection.test.ts` fail on the base sources and pass after.
- `watchInjectionVerdict` flags the owner's injected body when someone else edited it or its edits are unknown, and a title the owner did not write (REQ-watch-1202, `tests/watch.github-roles.postreview.test.ts`).

## Added

### REQUIREMENT REQ-watch-1202

IDENTITY-12.a follow-up to #374 (REQ-watch-1201, REQ-watch-071): GitHub keeps
a comment's or an issue / PR body's author as its `user` when someone with
write access (or an Actions / App token) edits it, so the sender triggered a
run only through text nobody else edited.

- The search clients SHALL carry, on each `issue_comment` and `issues`
  event, `DetectedEvent.textEditorIds`: the GitHub numeric user ids of
  everyone who edited the triggering text after it was posted — `[]` for a
  comment whose `updated_at` is its `created_at`; otherwise, and for every
  body, what `SearchClient.findTextEditors(nodeId)` reads (the live client:
  GraphQL `TEXT_EDITORS_QUERY` on the REST `node_id` — `lastEditedAt`, the
  last `editor`, and every `userContentEdits` revision's `editor` and
  `deletedBy` — parsed by `textEditorIdsFromNode`). An editor or deleter
  with no numeric id, a history longer than was read, a failed lookup (a
  rate limit still bubbles) or a client with no lookup SHALL leave it absent
  (unknown). Every event SHALL carry `threadAuthorId`, the numeric id of the
  thread's author, when the API gave it. The fixture client takes
  `updated_at` and `editor_ids` on comments and `body_editor_ids` on items
  (default: never edited).
- `textUneditedByOthers(event)` (`src/watch/router.ts`) SHALL be true only
  when `senderId` and `textEditorIds` are known and every editor is
  `senderId`. `watchTriggerRole` SHALL give `community` when it is false
  (fail closed), and the identity block's role line for a declared owner or
  team sender SHALL then read `- role: <owner|team> (but someone else may
  have edited this text after they posted it, so this run has community
  tools)`. Editing one's own text keeps one's role.
- `watchInjectionVerdict` SHALL exempt only text the owner wrote (the owner
  by numeric id, REQ-watch-367): the body only when the owner sent it and
  `textUneditedByOthers` holds, the title only when `threadAuthorId` is the
  owner's. Every other part SHALL be scanned, so the owner's comment on a
  thread someone else opened has that thread's title scanned.
- No env var, config key, flag, table or schema change. A poll makes one
  GraphQL call per body-mention item and per edited mention comment.

Acceptance Criteria
- Through `startWatchPoller` with the fixture client: the owner's comment edited by a stranger and the owner's issue body edited by a team member → `actingRole: "community"` with the "someone else may have edited" role line; the owner's unedited comment, self-edited comment and unedited body → `"owner"`.
- A failed edit lookup, or a client with no lookup, leaves `textEditorIds` absent and the role community.
- The live client over a stubbed `fetch`: an edited comment and each body mention get one GraphQL lookup (an unedited comment none); a stranger's revision gives `[stranger, owner]`, a body with no edits `[]`, a 502 leaves it absent; `threadAuthorId` is the item author's id.
- `textEditorIdsFromNode`: `[]` for no edits; every editor and deleter; null for a missing editor id, a cut history or no node.
- `watchInjectionVerdict` flags the owner's injected comment when someone else edited it or its edits are unknown, and an injected title unless the owner opened the thread; through the poller a stranger's injected title on the owner's comment is refused before any run while the owner's own thread runs as the owner.
- `tests/watch.github-roles.postreview.test.ts` fails on the base sources and passes on the branch.
