---
module: agent
change: dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community
---

# Delta — agent (DISCORD-3.a chat/plumbing + identity/public Q&A prompt)

## Modified

### SPEC SECTION Public API

Export `MEMORY_AGENT_SYSTEM_INSTRUCTIONS` from `src/agent/execute.ts` (and
`src/agent/index.ts`).

NDJSON event stream (REQ-agent-073, issue #73): `src/agent/events-ndjson.ts`
owns `CORVIDINHO_PROTOCOL_VERSION` (2) and exports `frameFromEvent`,
`usageFrame`, `resultFrame`, `serializeFrame`, `createNdjsonWriter`,
`summarizeToolArgs`, `parseNdjsonLine`, `createNdjsonParser`,
`readNdjsonStream`, `progressFromFrame`, `collectTaskRunStream`. Frames:
`{protocol, type}` with AgentEvent types `StateChanged` / `Text` / `ToolCall`
(`name`, `argsSummary`) / `ToolResult` / `VerifyResult`, plus `usage`
(running prompt / completion / total tokens) and a final `result`
(`TaskResult`). `createTaskExecute({ onUsage })` reports running provider
totals; `extractUsage` reads OpenAI-compatible `usage`.

Project instructions (REQ-agent-084, AGENT-1, issue #84):
`src/agent/project-instructions.ts` exports `findProjectRoot`,
`loadProjectInstructions`, `renderProjectInstructions`,
`describeProjectInstructions`, `withProjectInstructions`,
`PROJECT_INSTRUCTION_FILES` (`AGENTS.md`, `CLAUDE.md`),
`PROJECT_INSTRUCTIONS_MAX_BYTES` (16 KiB), `PROJECT_INSTRUCTIONS_HEADER`,
`NOT_COMMITTED_REASON` and `projectInstructionsWarning`
(re-exported from `src/agent/index.ts`). `createTaskExecute` loads them from
`cwd` by default; `projectInstructions: false` opts out.
`ProjectInstructions.source` is `commit` when the project root holds `.git`
(files are read from the `HEAD` commit through read-only git: `ls-tree`,
`cat-file`, `diff --name-only`, hooks and fsmonitor off, env clamped with the
git plugins' `gitEnv`) and `working-tree` otherwise. A loaded file carries
`uncommitted: true` when its working-tree copy differs from `HEAD`.

`task-summary` exports `formatTaskPlumbing`, `chatBodyFromTaskResult`, and
`chatBodyFromTaskRunOutput` alongside `summarizeTaskResult`. Discord/NDJSON
bridge summaries SHALL use the chat-body helpers so operator plumbing never
appears in the final chat reply (DISCORD-3.a).

`execute` system prompt SHALL include IDENTITY-4 and ROLES-CHAT-8 instruction
blocks (`IDENTITY_AGENT_SYSTEM_INSTRUCTIONS`, `PUBLIC_QA_AGENT_SYSTEM_INSTRUCTIONS`)
in addition to MEMORY instructions.

### SPEC SECTION Change Log

Flesh LLM tool loop MVP on prove-before-done (#31) (2026-09-26, corvid-agent).
| 2026-09-26 | dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community: chat/plumbing split for Discord summaries; identity + public Q&A system instructions |
| 2026-09-26 | flesh-full-llm-tool-loop-on-prove-before-done-so-task-run-discord-watch-can-call-allowlisted-plugins-via-openai: Flesh full LLM tool loop on prove-before-done so task run / Discord / WATCH can call allowlisted plugins via OpenAI-compatible tools (issue #31 dogfood MVP) |
| 2026-09-26 | memory-discord-inject: MEMORY system prompt + tool argv (REQ-agent-010) |
| 2026-09-26 | discord-memory-auto-recall-inject-on-spawn-plus-system-prompt-store-recall-rules-agent-7-memory-2-4-draft-67-behavior: Discord MEMORY auto-recall inject on spawn plus system-prompt store/recall rules (AGENT-7 MEMORY-2/4 draft #67 behavior) package 0.0.7 |
| 2026-09-26 | tool-loop-dispatches-only-tools-offered-in-the-run-s-catalog-safe-1-agent-5-pr-128-review-follow-up-a-registered-but: Tool loop dispatches only tools offered in the run's catalog (SAFE-1 / AGENT-5, PR #128 review follow-up): a registered but not-offered (e.g. dangerous or above-tier) plugin name from the model is refused instead of run; memory store test updated for soft-deleted re-store history |
| 2026-09-26 | spawned-agents-ignore-the-project-env-and-tests-never-create-real-worktrees-allow-4-safe-1-session-worktree-3-hygiene: Spawned agents ignore the project .env and tests never create real worktrees (ALLOW-4 / SAFE-1 / SESSION-WORKTREE-3 hygiene): bun-invoked spawns pass --no-env-file so a project worktree's .env cannot inject allowlists, admin lists or keys into the agent; bridge and slash fixture tests use temp project roots so bun test never adds talk/* worktrees or branches to the repo |
| 2026-09-26 | live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one: Live NDJSON event stream for bridges (issue #73, AGENT-8 / CLI-7 / DISCORD-3 / DISCORD-10): task run --output ndjson emits one versioned JSON object per line for StateChanged/Text/ToolCall(redacted argument summary)/ToolResult/VerifyResult, running token usage, and a final result line; Discord and WATCH spawn clients consume the stream and forward state/tool/tokens to onStatus; protocol version 1 to 2 |
| 2026-09-26 | task-run-reads-the-project-s-own-agents-md-and-claude-md-from-the-project-root-into-the-llm-system-prompt-as-labelled: Task run reads the project's own AGENTS.md and CLAUDE.md from the project root into the LLM system prompt as labelled project instructions (AGENT-1, issue #84 captured slice): 16 KiB cap with truncation marker, symlinks outside the project refused, binary/non-UTF-8 refused, SAFE-6 scrubbed |
| 2026-09-26 | call-registered-fledge-plugins-as-tools-issue-112-fledge-4-5-plugin-2-3-6-discover-the-project-s-fledge-plugins-via-the: Call registered Fledge plugins as tools (issue #112, FLEDGE-4/5 PLUGIN-2/3/6): discover the project's Fledge plugins via the fledge CLI, register each command as a dangerous typed plugin run through fledge plugins run with argv arrays, and show per-command tool schema cost plus a context budget line in plugins list |
| 2026-09-26 | repo-projects-load-agents-md-and-claude-md-from-the-head-commit-not-the-working-tree-so-the-non-dangerous-file-tools: Repo projects load AGENTS.md and CLAUDE.md from the HEAD commit, not the working tree, so the non-dangerous file tools cannot plant system-prompt instructions for later runs (AGENT-1 hardening, issue #84, review of PR #150) |
| 2026-09-26 | roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat: ROLES-CHAT-2 catalog omit mutating for non-ADMIN |
