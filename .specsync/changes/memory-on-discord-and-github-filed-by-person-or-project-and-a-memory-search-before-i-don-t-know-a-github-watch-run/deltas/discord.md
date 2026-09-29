---
module: discord
change: memory-on-discord-and-github-filed-by-person-or-project-and-a-memory-search-before-i-don-t-know-a-github-watch-run
---

# Delta — discord (ranked recall, the inject searches memory for the message, GitHub subjects, Discord spawn clears GitHub keys)

## Added

### REQUIREMENT REQ-discord-067

Ranked recall and a memory search for each message (MEMORY-9, #67), and the
GitHub memory subject (MEMORY-8). `MemoryStore.recall` with a `query` SHALL
be a search: its terms (`recallTerms`: lowercased letters/digits, words of
two or more characters, common question words and pronouns dropped, a light
English stem, at most 24) and the whole query are matched in keys and content
(case-insensitive), at most 500 newest candidates are read, a key read in two
scopes is kept once (newest), and rows are ranked (`rankMemories`) by
relevance — each term weighted by its inverse frequency among the
candidates, a key hit counting double, the whole query adding a bonus — times
a recency weight (30-day half-life, never below 3/4), newer first on ties.
A query with no terms SHALL match as one substring, newest first, as before.
Private notes stay out unless asked (MEMORY-7). No FTS table and no schema
change.

The chat and button-pick inject (REQ-discord-023 / REQ-discord-101) SHALL
search memory for the human's message (the picked label on a button):
`recallRelevantThenRecent` — the rows relevant to it first, then the newest to
fill, at most 20 — for the speaker's block and for the owner / team project
block; the owner's and team's `/work` project block (REQ-discord-101) SHALL
likewise be searched for the work description
(`enrichPromptWithProjectMemory(…, limit, query)`). Without a query the
blocks are the newest rows, as before.

`memorySubjectForGithub(dir, { login, id })` SHALL resolve a GitHub
commenter to their declared person's subject (the same scopes as on Discord;
the configured owner not declared under `[people]` to their Discord-id
subject; undeclared or ambiguous ⇒ null), and `projectScopeForRepo(repo)`
SHALL give `project:<owner/repo>` lowercased for a valid `owner/repo` (else
null). The Discord agent spawn SHALL always clear
`CORVIDINHO_ACTING_GITHUB_LOGIN` / `_ID` / `_REPO`, so a Discord or
scheduled run never acts for a GitHub commenter.

Acceptance Criteria
- A question in plain words finds the fact it is about; a key hit outranks a newer passing mention; equal relevance goes to the newer row; a question-words-only query matches as one substring.
- A multi-scope search keeps the newest of a key once and leaves private notes out.
- The Discord inject holds an older fact the message is about although newer rows fill the block; an owner's `/work` run holds an older project fact its description is about although newer rows fill the block.
- `memorySubjectForGithub` matches by numeric id or login, refuses a login whose numeric id differs, and maps the undeclared-under-`[people]` owner to their Discord id; `projectScopeForRepo` accepts only `owner/repo`.
- A Discord spawn clears inherited GitHub commenter keys.
- `tests/memory.recall-github.test.ts` and `tests/memory.rank.test.ts` cover each and fail on the stacked base sources.
