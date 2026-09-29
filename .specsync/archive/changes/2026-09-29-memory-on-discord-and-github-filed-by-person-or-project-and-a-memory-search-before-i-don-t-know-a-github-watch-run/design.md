---
change: memory-on-discord-and-github-filed-by-person-or-project-and-a-memory-search-before-i-don-t-know-a-github-watch-run
artifact: design
---

# Design

- **One resolver per surface, same scopes (MEMORY-8).** Discord keeps
  `memorySubjectFor(dir, discordId)`; GitHub gets
  `memorySubjectForGithub(dir, { login, id })` over the same people
  directory and `resolvePerson` (numeric id / login only, IDENTITY-7), so a
  declared person has one profile whichever surface they use. The acting
  GitHub ids come only from env the WATCH spawn stamps from the GitHub API
  event (`CORVIDINHO_ACTING_GITHUB_LOGIN` / `_ID` / `_REPO`), like the
  Discord actor; a Discord actor always wins, the Discord spawn clears the
  GitHub keys, and delegate workers already drop every
  `CORVIDINHO_ACTING_*` key.
- **Community scope on GitHub.** WATCH stays a community role session
  (IDENTITY-12 unchanged): no project writes, `--person` owner-only (never
  on GitHub), private notes and forget-me refused (the thread is public; a
  forget request comes from a Discord conversation). The one widening is read:
  `memory-recall --project` in a GitHub run reads the thread repo's project
  memory, keyed `project:<owner/repo>` lowercased (`projectScopeForRepo`) —
  the key a checkout of that repo gets from its origin, so it is the memory
  owner / team keep for that repo, not the watcher's own checkout.
- **Ranked recall without a new table (MEMORY-9).** The store reads up to 500
  newest candidate rows holding the query or any of its terms (`LIKE`), then
  ranks them in TypeScript (`src/memory/rank.ts`): inverse-frequency term
  weights, key hits double, whole-query bonus, times a recency weight
  (30-day half-life, floor 3/4). Memory per scope is small, so no FTS5 table,
  no schema bump, no migration. A query of only question words keeps the old
  substring behaviour.
- **Search before the model speaks (no model call).** Discord chat / button
  and WATCH already prepend memory blocks, and owner / team `/work` a project
  block; they now search for the message (the `/work` description)
  (`recallRelevantThenRecent`: relevant rows first, the newest to fill), so
  the model has searched memory before it could say it doesn't know.
- **Guard in the loop (a model call only on a hit).** `src/agent/recall-guard.ts`:
  a final reply matching an "I don't know / don't remember / no information"
  heuristic, in an attempt where the person's own memory or the project's
  was not searched yet — no injected block of that kind at the head of the
  task (a header quoted in the message does not count) and no
  `memory-recall` call for it — makes the loop run the missing
  `memory-recall --query` / `--project --query` itself through `runPlugin`
  (same gates); a `/work` run, with only the project block, still gets the
  person's own search. Nothing ⇒ the reply stands. Found ⇒ one user message
  with the facts and one more model reply (not counted as a tool round), once
  per attempt.

## Design choices pending Leif

Each is the most conservative reading of the captured text and the interview
decisions; none adds a criterion.

1. "No saves about others" for an undeclared GitHub commenter is read as no
   saves at all (there is no declared identity to file their facts under);
   they read the thread repo's project memory only.
2. GitHub runs never write project memory, whoever comments: WATCH stays a
   community session (IDENTITY-12), so even the owner or a team member saves
   project facts from Discord or the CLI, not from a GitHub thread.
3. Private notes are never read in a GitHub run and `memory-forget-me` is
   refused there (threads are public; forget requests come from a Discord
   conversation). A declared commenter can still save a private note.
4. The configured owner not declared under `[people]` uses their Discord-id
   memory on GitHub too (as on Discord).
5. Project memory in a GitHub run is the thread's repo (`owner/repo`), not
   the watcher's checkout; a run with no valid repo gets no project memory.
6. Community on Discord still reads no project memory (#101's MEMORY-6 call
   unchanged); only GitHub gets the read-only project scope, as decided.
7. The "I don't know" check is an English phrase heuristic; a miss means only
   that the injected search (Discord / WATCH) and the prompt rule are the
   safeguards. The search uses the request's words (harness blocks, the WATCH
   label and URLs dropped).
8. Ranking is in TypeScript over at most 500 candidates, not FTS5 (no schema
   change); `memory-keys` from the issue's steal list is not built — the
   captured text does not need it.
