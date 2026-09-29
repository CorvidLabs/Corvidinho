# Lesson bundle — memory-on-discord-and-github-filed-by-person-or-project-and-a-memory-search-before-i-don-t-know-a-github-watch-run

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Memory on Discord and GitHub, filed by person or project, and a memory search before I don't know: a GitHub WATCH run saves and recalls for the commenter's declared person (people list, stable GitHub ids) with MEMORY-7 privacy while an undeclared commenter reads only the thread repo's project memory and saves nothing (REQ-watch-008 changed); a recall with a query is ranked by relevance then recency; the Discord and WATCH injects search memory for the message; the tool loop searches memory itself before a reply that says it doesn't know, costing a model call only when facts are found (MEMORY-8, MEMORY-9, #67)
- **Kind**: Feature
- **Specs**: agent, plugins, watch, discord
- **Paths**: hi/memory.md, INTENT.md, src/memory/rank.ts, src/memory/store.ts, src/memory/scope.ts, src/memory/index.ts, plugins/memory/commands.ts, src/watch/memory-inject.ts, src/watch/agent-client.ts, src/watch/poller.ts, src/discord/agent-client.ts, src/discord/memory-inject.ts, src/discord/bridge.ts, src/discord/command-handlers/work.ts, src/agent/execute.ts, src/agent/recall-guard.ts, tests/memory.recall-github.test.ts, tests/memory.rank.test.ts, docs/WATCH.md, docs/discord.md, docs/DISCORD-GO-LIVE.md, STATUS.md
- **Acceptance**: In a GitHub WATCH run the memory plugins act for the commenter's declared person, matched by GitHub numeric id / login in the owner's people list re-read at the call (stable ids only; a login whose numeric id differs matches nobody), storing into and recalling from the same person:<id> profile as on Discord (the configured owner not declared under [people] on their Discord-id scope), with MEMORY-7 privacy: on GitHub --person is refused for anyone but the commenter, private notes and memory-forget-me are refused and project memory is read-only; an undeclared commenter gets community scope - memory-recall --project reads the thread repo's project memory (project:<owner/repo>), nothing is saved; the WATCH spawn passes the commenter's login, numeric id and the thread's repo (CORVIDINHO_ACTING_GITHUB_LOGIN / _ID / _REPO) with no Discord actor, non-ADMIN, and the Discord spawn clears those keys (REQ-watch-008 changed; MEMORY-8); memory-recall --query is a ranked search (terms and the whole query matched in keys and content, rarer terms and key hits weigh more, newer first among near-equals; no schema change), the Discord chat / button inject and the WATCH poller search memory for the message or comment and prepend the relevant rows first, and when the model's final reply says it doesn't know with no memory search yet in the attempt the tool loop runs memory-recall itself - nothing found keeps the reply with no extra model call, facts found go back to the model once (MEMORY-9); tests/memory.recall-github.test.ts and tests/memory.rank.test.ts cover each and fail on the stacked base sources

## Evidence

- Verification commit: `e68b9bf1b566cdc8b60d3287ff2fd60f8faa96c5`
- Base commit: `1a392777183f0f7f0b53d14efc2ffc8a70e277ca`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins --spec watch`

## From the change's context.md

# Context

Issue #67 (MEMORY: "recall before claiming ignorance", ranked recall, memory
tools on every surface; milestone M1 "Knows everyone", build step 9 of 11),
stacked on #101 (branch `claude/m1-101-profiles`: person / project memory
and MEMORY-7 privacy), itself on #65 (roles) and #36 (declared people), whose
people registry and resolver, role gate and memory scopes this reuses. #101's
own SpecSync change is still active in the tree and is left alone.

Leif confirmed the criteria in the 2026-09-28 interview (round 6: "#67 memory
surfaces: capture MEMORY-8 (Discord + GitHub; AlgoChat Post-v1) and MEMORY-9 —
WATCH runs may save/recall scoped by the commenter's declared identity with
MEMORY-7 privacy (changes REQ-watch-008); search memory before 'I don't
know'"). Captured with `hi` in this PR's first commit:

- **MEMORY-8** "It saves and recalls facts in Discord and GitHub
  conversations, filed by person or project."
- **MEMORY-9** "It searches memory before saying it doesn't know."

Design decisions from the interview carried here: WATCH (GitHub) runs may now
save and recall, scoped by the commenter's declared identity (people
registry) with MEMORY-7 privacy — REQ-watch-008 (memory refused in GitHub
runs) changes; undeclared GitHub users get community scope (read project
memory only, no saves about others); the agent consults memory ranked by
relevance / recency before answering that it doesn't know, in the prompt /
tool loop, without extra model calls where possible; MEMORY-ACL gates stay.

Gap on the stacked base (9270d81): GitHub runs clear the acting user, so every
memory plugin refuses there; `--query` is one `LIKE %query%` substring
ordered by recency (a question in plain words finds nothing); the Discord
inject is the newest 20 rows whatever the message asks; nothing in the loop
checks for a memory search before a reply that says it doesn't know.

Settled constraints: v1 off-chain (no AlgoChat / wallet / MainNet surface —
AlgoChat is Post-v1); owner admins, the team works; specs/ only through
SpecSync; MEMORY-ACL-1..6 unchanged; no schema change; #232 / #233 scope
untouched. Out of scope (issue): profiles / forget (#101, shipped below),
graduation and decay (#116), on-chain memory (MEMORY-3).

## From the change's design.md

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

## From the change's testing.md

# Testing

Fixture tests only: a temp allowlist file (people with Discord ids, GitHub
logins and numeric ids, `[owner] github_login`) and a temp data dir;
`runPlugin` with bridge-shaped and WATCH-shaped env; `startWatchPoller` with
injected events, an injected in-memory DB and a recording agent; spawn clients
running a tiny script that prints its env; `createTaskExecute` with a fake
LLM fetch. No Discord, no GitHub, no network.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-067` | `tests/memory.recall-github.test.ts` ("MEMORY-8 memory in GitHub (WATCH) runs …") | A declared commenter (numeric id, or login in any case) stores into `person:tofu`, recalls with a plain-words `--query` and reads `memory-profile`; Discord reads the same rows and a row stored on Discord is recalled on GitHub; the `[owner]` GitHub login recalls the owner's Discord-id memory; on GitHub private notes (content never in the refusal), `memory-forget-me` and `--person` (`kyn`, a Discord id, an unknown id) are refused and another person's rows never show; a login whose numeric id differs saves nothing; an undeclared commenter's own and `--project` stores are refused (nothing saved), their personal recall is refused and `--project` reads only the thread repo's project row (not another repo's); a Discord actor wins over stale GitHub keys. |
| `REQ-watch-008` / `REQ-watch-067` | `tests/memory.recall-github.test.ts` ("REQ-watch-008 / REQ-watch-067 spawn env …") | The WATCH spawn env carries `tofu-dev` / `4242` / `CorvidLabs/Corvidinho` over stale values with an empty Discord actor and `CORVIDINHO_ACTING_IS_ADMIN=0`; `tests/memory.spawn-env.test.ts` "WATCH spawn clears the acting env" still passes. |
| `REQ-discord-067` | `tests/memory.recall-github.test.ts` ("REQ-watch-008 / REQ-watch-067 spawn env …") | The Discord spawn clears inherited `CORVIDINHO_ACTING_GITHUB_*` keys. |
| `REQ-watch-067` | `tests/memory.recall-github.test.ts` ("MEMORY-8/9 WATCH poller …") | Through `startWatchPoller` (injected DB): the declared commenter's prompt holds `TOFU-HELIX` and the repo's `PROJECT-EDITORCONFIG`, never `KYN-VIM`; the undeclared commenter's holds only the project row; `runChat` gets `actingGithubLogin`, `actingGithubId`, `repo`. |
| `REQ-watch-067` | `tests/memory.rank.test.ts` ("enrichWatchPromptWithMemories") | Declared with nothing stored: header + empty one-liner; undeclared with no project rows, or no store: unchanged; the project block names `corvidlabs/corvidinho`; a 3000-char row is clipped to 1000. |
| `REQ-discord-067` | `tests/memory.recall-github.test.ts` ("MEMORY-9 ranked recall …", "the Discord inject searches memory …") | "What is Tofu's timezone?" returns the timezone row only; a two-topic question returns both; a key hit outranks a newer passing mention, equal relevance goes to the newer row; with 25 newer rows the inject for "what timezone am I in?" still holds the older timezone fact (block of 20). |
| `REQ-discord-067` | `tests/memory.rank.test.ts` ("recallTerms / stemTerm", "rankMemories", "MemoryStore.recall with a query …", "memorySubjectForGithub / projectScopeForRepo") | Terms drop question words and stem; idf and key weighting order; the recency floor; a multi-scope search keeps the newest of a key once and no private note; a question-words-only query is one substring; `recallRelevantThenRecent` fills relevant then newest; the GitHub subject by id / login, a login with another id is nobody, the built-in owner on their Discord id; `projectScopeForRepo` accepts only `owner/repo`. |
| `REQ-discord-067` | `tests/memory.recall-github.test.ts` ("MEMORY-9 /work: the project block is searched for the description") | With 25 newer project rows, `enrichPromptWithProjectMemory(…, 20, "fix the flaky deploy script")` and the owner's `/work` through `handleWorkCommand` (a git checkout whose origin is `CorvidLabs/Demo`) both carry the older `DEPLOY-FACT` row. |
| `REQ-agent-067` | `tests/memory.recall-github.test.ts` ("MEMORY-9 the tool loop searches memory …") | A final "I don't know who Tofu is." makes the loop call `memory-recall` itself (a `ToolCall` event), the second request carries "Tofu is the release captain" and the summary is the second reply; with nothing stored one model call and the reply stands; an injected memory block, or the model's own `memory-recall`, means no second search; a task led by a project block only (a `/work` run) still gets one own search (no `--project`) and the fact reaches the model; a memory header quoted after the message does not turn the search off; end to end in a GitHub-shaped env the model's `memory-store` lands in SQLite under `person:tofu` and its `memory-recall` result reaches the model. |
| `REQ-agent-067` | `tests/memory.rank.test.ts` ("recall-guard") | `claimsIgnorance` matches seven "don't know / no information / can't recall" phrasings and not ordinary replies (including "couldn't find src/foo.ts"); `taskHasMemorySearch` / `injectedMemorySearches` (only head blocks count, own and project apart) and `memoryRecallSearchKind`; `memorySearchQuery` drops the harness block, the `[WATCH …]` label and URLs; `searchMemoryBeforeIgnorance` runs `--query` then `--project --query` (only the ones not yet run), lists own then project rows, returns null when refused or empty. |
| `REQ-agent-010` / `REQ-agent-101` / `REQ-plugins-101` | `tests/discord.memory-inject.test.ts`, `tests/memory.profiles.test.ts`, `tests/memory.plugins.test.ts`, `tests/memory.spawn-env.test.ts` (unchanged) | The earlier prompt phrases, profiles, privacy, project memory and spawn hygiene stay green. |

Fail on base: with the stacked base (9270d81) checked out in a separate
worktree and the two new test files copied in,
`tests/memory.rank.test.ts` fails to load (`src/agent/recall-guard.ts`
missing) and `tests/memory.recall-github.test.ts` (base APIs only) fails 12
of 16 — the four that pass there hold on base by design (a login whose id
differs saves nothing, a Discord actor wins over GitHub keys, nothing stored
means one model call, an injected block or the model's own recall means no
second search: all guards against doing too much). On the branch both files
pass (31 of 31).

Review fixes (the `/work` search and the head-only inject check): the three
tests added to `tests/memory.recall-github.test.ts` ("/work: the project
block is searched …", "a project-only block … still gets the person's own
search", "a memory header quoted inside the message …") fail both on the
stacked base and on the pre-review head (2a2c058) and pass after the fix; on
the base the file now fails 15 of 19. On the branch both files pass (36 of
36).

Full suite: `bun test` green; `bunx tsc --noEmit` clean; `specsync check
--require-coverage 100` 100%; `hi check` green; `fledge lanes run verify
--non-interactive` completed.

## Where these lessons go

- `specs/agent/context.md`
- `specs/plugins/context.md`
- `specs/watch/context.md`
- `specs/discord/context.md`
