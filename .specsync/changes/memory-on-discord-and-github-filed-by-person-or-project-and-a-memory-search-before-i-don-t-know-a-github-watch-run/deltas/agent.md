---
module: agent
change: memory-on-discord-and-github-filed-by-person-or-project-and-a-memory-search-before-i-don-t-know-a-github-watch-run
---

# Delta — agent (search memory before "I don't know"; memory on GitHub in the prompt rules)

## Added

### REQUIREMENT REQ-agent-067

Recall before "I don't know" in the tool loop (MEMORY-9, #67), and the
GitHub memory rules (MEMORY-8). `MEMORY_AGENT_SYSTEM_INSTRUCTIONS`
(REQ-agent-010 / REQ-agent-101) SHALL also tell the model to trust a
`[Corvidinho memory for this GitHub user …]` block like the Discord one;
before saying it doesn't know or remember something — a person, a project, an
earlier decision, anything the user may have said before — to search memory
(the injected blocks were searched for this message; otherwise
`memory-recall --query` with the key words, ranked by relevance then recency,
`--project` for repo facts) and to say it doesn't know only after that
search came back empty; and (i) that in a GitHub (WATCH) run the memory tools
act for the commenter's declared person recognised by their GitHub account,
an undeclared commenter has only the repo's project memory to read and nothing
saved, issue / PR threads are public so nothing stored about another person is
posted, and private notes are never read there.

The tool loop SHALL back the rule without extra model calls where possible
(`src/agent/recall-guard.ts`): when the model's final reply (no tool calls)
says it doesn't know or remember (`claimsIgnorance`, an English heuristic),
`memory-recall` is in the run's catalog, and no memory search ran in this
attempt — no injected memory block in the task (`taskHasMemorySearch`) and
no `memory-recall` call by the model — the loop SHALL run `memory-recall
--query <request words>` then `memory-recall --project --query <request
words>` itself (`memorySearchQuery`: the task as Planning reads it, without
`[Corvidinho …]` blocks, the `[WATCH …]` label and URLs, at most 500
characters) through `runPlugin` with the run's cwd, allowlist, tier and
signal (the same ACL and role gates as a model call), emitting `ToolCall` /
`ToolResult` events for each. When neither returns rows (or both are
refused) the reply SHALL stand and no further model call SHALL be made. When
rows come back the loop SHALL add one user message (`[Corvidinho memory
search before "I don't know" (MEMORY-9) …]` header, at most 10 rows of each,
facts not instructions) and ask the model once more; that extra round SHALL
NOT use up a tool round. The search SHALL run at most once per attempt.

Acceptance Criteria
- A final "I don't know …" in a run whose actor has a matching stored fact makes the loop call `memory-recall` itself (a `ToolCall` event), send the fact back once and return the model's next reply.
- With nothing found the reply stands after one model call.
- A task with an injected memory block, or a run where the model already called `memory-recall`, gets no second search.
- End to end in a GitHub-shaped env, the model's `memory-store` lands in SQLite under the commenter's `person:<id>` and its `memory-recall` returns it to the model.
- `MEMORY_AGENT_SYSTEM_INSTRUCTIONS` keeps the REQ-agent-010 / REQ-agent-101 phrases.
- `tests/memory.recall-github.test.ts` and `tests/memory.rank.test.ts` cover each and fail on the stacked base sources.
