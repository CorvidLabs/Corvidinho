---
change: memory-on-discord-and-github-filed-by-person-or-project-and-a-memory-search-before-i-don-t-know-a-github-watch-run
artifact: testing
---

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
