---
module: watch
change: memory-on-discord-and-github-filed-by-person-or-project-and-a-memory-search-before-i-don-t-know-a-github-watch-run
---

# Delta — watch (memory in GitHub runs: the commenter's declared person, the thread repo's project memory, a search for the comment)

## Added

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
commenter whose GitHub numeric id / login resolves to a declared person in
the owner's people list re-read for the event (`memorySubjectForGithub`,
stable ids only, IDENTITY-7) a `[Corvidinho memory for this GitHub user …]`
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

## Modified

### REQUIREMENT REQ-watch-008

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
