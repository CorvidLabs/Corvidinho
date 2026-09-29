---
change: memory-on-discord-and-github-filed-by-person-or-project-and-a-memory-search-before-i-don-t-know-a-github-watch-run
artifact: research
---

# Research

- Memory on the stacked base (`plugins/memory/commands.ts`,
  `src/memory/scope.ts`): the subject is the acting Discord id from the
  bridge env matched in the people list; a WATCH spawn clears it
  (REQ-watch-008), so every memory plugin refuses in GitHub runs;
  `--project` is owner / team / local only (WATCH is community,
  `resolveActingRole`).
- People (#36 `src/identity/people.ts`): `resolvePerson(dir, { githubLogin,
  githubId })` already resolves GitHub commenters on stable ids (a renamed /
  reused login with another numeric id is dropped); the WATCH router uses it
  for the identity block; `DetectedEvent.senderId` carries the numeric id.
- The WATCH spawn (`src/watch/agent-client.ts`) inherits `process.env` and
  overwrites the Discord actor; the Discord spawn overwrites its own keys;
  delegate workers drop every `CORVIDINHO_ACTING_*` key (so new
  `CORVIDINHO_ACTING_GITHUB_*` keys never reach a worker).
- Recall: `MemoryStore.recall({ query })` is `key LIKE %q% OR content LIKE
  %q%` newest first, so "what is Tofu's timezone?" finds nothing; the
  Discord inject is the newest 20 rows whatever the message says; the only
  "recall before ignorance" is prompt rule (c) (REQ-agent-010).
- Planning already has `planningSelectionText` (drops `[Corvidinho …]`
  blocks and `[WATCH …]` labels), reused for the search words.
- corvid-agent steal notes (#67): `semantic-search.ts` FTS5 + TF-IDF,
  `decay.ts` time decay, `cache.ts` LRU — taken as TF-IDF-style term
  weights and a recency weight computed in TypeScript over a bounded
  candidate set (memory per scope is small; FTS5 would need a new virtual
  table and a schema bump, which the captured text does not need); tool
  descriptions that make models use them (memory-recall now says to search
  with `--query` before claiming ignorance); Merlin m#1110 "ship with an
  end-to-end test through the real tool loop" (the GitHub e2e test: model →
  `memory-store` → SQLite → `memory-recall` → model); notes Feedback.md
  "Recall contacts before claiming ignorance" (the loop guard). Merlin
  `memory-keys` is not taken (not needed by the captured text).
