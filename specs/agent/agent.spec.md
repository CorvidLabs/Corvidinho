---
module: agent
version: 22
status: draft
files:
  - src/agent/types.ts
  - src/agent/config.ts
  - src/agent/verify.ts
  - src/agent/loop.ts
  - src/agent/specLoader.ts
  - src/agent/index.ts
  - src/agent/task-summary.ts
  - src/agent/execute.ts
  - src/agent/spawn-argv.ts
  - src/agent/tier.ts
  - src/agent/tools.ts
  - src/agent/project-instructions.ts
  - src/agent/events-ndjson.ts
  - src/agent/ask.ts
  - tests/agent.execute.test.ts
  - tests/agent.tool-loop.test.ts
  - tests/spawn.argv.test.ts
  - tests/agent.project-instructions.test.ts
  - tests/agent.events-ndjson.test.ts
  - tests/agent.ndjson-spawn.test.ts
  - tests/agent.ask.test.ts
  - src/autonomous/enabled.ts
  - src/autonomous/delegate.ts
  - tests/autonomous.enabled.test.ts

db_tables: []
depends_on:
  - plugins
---

# Agent

## Purpose

Agent execute tool-loop also carries MEMORY instructions (AGENT-7 / MEMORY-2/4)
so Discord/CLI chats trust injected facts and call memory-store/recall
appropriately (REQ-agent-010).

## Public API

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

Autonomous gate + delegation core (REQ-agent-117, issue #117):
`src/autonomous/enabled.ts` exports `parseAutonomousConfig`,
`loadAutonomousConfig`, `isAutonomousEnabled`, `autonomousSessionAllowed`;
`src/autonomous/delegate.ts` exports `delegateDepthFromEnv`,
`canDelegateAtDepth`, `clampChildTier`, `parseDelegateArgs`,
`buildDelegateTaskText`, `resolveDelegateBin`, `isWorkerEnvDropped`,
`buildDelegateSpawn`, `createDelegateLimiter`, `runDelegateChild` and the caps
(`MAX_DELEGATE_DEPTH` 2, `MAX_CONCURRENT_DELEGATES` 2,
`MAX_DELEGATES_PER_RUN` 4, `DELEGATE_MIN_TIER` 2). `buildOpenAiTools` takes
`autonomous?: boolean`; `createTaskExecute` takes `autonomous?: boolean`
(default: `autonomousSessionAllowed({ cwd, env })`).

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

Ask the human (REQ-agent-044, issue #44, AUTONOMY-1/2): `src/agent/ask.ts`
exports `ASK_TOOL_NAME` (`ask-human`), `withAskTool`, `askFromToolArguments`,
`askFromUnknown`, `formatAskSummary`, `stuckAfterVerifyAsk`,
`ASK_AGENT_SYSTEM_INSTRUCTIONS`. `AgentState` gains `blocked`;
`ExecuteResult` / `TaskResult` gain optional `ask: { reason: "clarify" |
"stuck", question }`. A clarify ask ends the run `blocked` (verify skipped,
exit 0); verify exhaustion stays `failed` and carries a `stuck` ask. Additive
on the NDJSON wire: protocol stays 2.

## Invariants

Tool-loop system prompt SHALL include trust-inject / memory-store /
memory-recall-before-ignorance / never-invent rules. OpenAI tool argv
descriptions for `memory-*` commands SHALL include concrete examples.

NDJSON frames never carry raw tool arguments; ToolCall `argsSummary`, Text,
ToolResult detail and VerifyResult output are SAFE-6 scrubbed and capped.
AgentEvent stays frozen (usage is a separate callback), so `task run --json`
events are unchanged.

Autonomous mode is off unless the project `fledge.toml` sets
`[corvidinho.autonomous] enabled = true` (AUTONOMOUS-1). Autonomous extras are
left out of the tool catalog unless the session is allowed (enabled, depth
below 2) and appear at code tier only (SAFE-9). The tool loop passes its tier
and abort signal to `runPlugin`. A worker never runs above the lead's tier
(omitted = the lead's), is forced non-interactive with the lead's allowlist,
no ADMIN and no SAFE-4 confirm tokens, keeps prove-before-done (never
`--no-verify`, REQ-cli-085), runs one level deeper, and is stopped on
lead abort, timeout or lead exit; at most 2 run at once and 4 per lead run.
These are safety defaults, not HI (draft AUTONOMOUS-10 left for capture).

Project instructions come only from the project root (nearest `.git` at or
above cwd, else cwd), never from a parent directory above it. Each file is
capped at 16 KiB with a truncation marker, SAFE-6 scrubbed, and labelled as
project instructions that cannot widen SAFE-1 consent, the tool allowlist or
the capability tier. The loader never throws.

In a git project only the `HEAD` copy of an instruction file reaches the
system prompt. The file tools (files-write / files-edit, not dangerous) can
change the working tree without consent, so working-tree edits and untracked
instruction files are never loaded; only a commit, which needs a dangerous,
consented tool such as `git-commit` (SAFE-1), changes what later runs see. A
`.git` that git cannot read never falls back to the working tree. Committed
symlinks are followed only as paths inside the commit, never through the
filesystem.

`buildOpenAiTools` omits mutating plugins when `actingIsAdmin` is false (ROLES-CHAT-2); `createTaskExecute` resolves ADMIN from env via `resolveActingIsAdmin` when a role session is active.

`ask-human` is intercepted by the tool loop (never dispatched as a plugin) and
is offered only on tool/code tiers. A run with an ask is never `done`; the
question is capped at 1500 chars and an empty question is refused back to the
model.

## Behavioral Examples

### Scenario: System prompt mentions memory-store

- **Given** tool-loop execute is constructed
- **When** the system message is built
- **Then** it embeds MEMORY_AGENT_SYSTEM_INSTRUCTIONS with argv example for
  memory-store

### Scenario: delegate hidden until the project opts in

- **Given** a project whose `fledge.toml` has no `[corvidinho.autonomous]`
- **When** a code-tier task run builds its tool catalog
- **Then** `delegate` is not offered, and a model call naming it is refused

### Scenario: lead delegates a subtask

- **Given** `[corvidinho.autonomous] enabled = true` and a code-tier lead
- **When** the model calls `delegate` with `--skill specsync --task ...`
- **Then** a worker `task run` runs non-interactive at depth 1 and its summary and filesChanged come back in the tool result for the lead to synthesize

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Verify exhausted | state failed, verified=false, summary includes verifier output, `ask` reason stuck |
| Model calls ask-human | state blocked, verifySkipped=true, `ask` reason clarify, summary `Needs your input: …` |
| ask-human with empty question | ToolResult success=false fed back to the model; loop continues |
| AbortSignal fired | cancelled=true (outer loop) or execute returns early mid tool loop |
| fledge missing | verify failure output names PATH miss |
| SpecSync registry missing | Planning soft-fails; execute continues |
| Dangerous plugin + non-interactive + not allowlisted | ToolResult success=false (SAFE-1); loop may continue |
| Autonomous tool named while not offered | Refused like any non-offered tool (REQ-agent-128) |
| Delegation depth env malformed | Treated as the cap; no further delegation |
| Worker hangs / lead interrupted | Worker SIGTERM then SIGKILL; lead returns after a short drain |
| AGENTS.md / CLAUDE.md missing | skipped; system prompt unchanged |
| Instruction file symlink resolves outside the project | refused; named in a one-time Text note; run continues |
| Instruction file is a directory, binary, or not UTF-8 | refused; named in a one-time Text note; run continues |
| Instruction file over 16 KiB | first 16 KiB kept (UTF-8 boundary) plus truncation marker; one-time Text note |
| Git project: working-tree AGENTS.md / CLAUDE.md differs from HEAD | HEAD copy loaded; one-time Text note says working-tree changes were not loaded |
| Git project: instruction file untracked, or HEAD unborn | refused as not committed; named in the Text note |
| Git project: `.git` unusable (not a repo top level, git missing) | present files refused; no working-tree fallback |
| Git project: committed symlink leaves the commit, is broken, hops a symlinked dir, or loops | refused; named in the Text note |

## Dependencies

Spawns `fledge` for the default verify runner. Reads SpecSync registry/specs via plugin helpers. Dispatches allowlisted plugins via `runPlugin` during the LLM tool loop. No Trust/attest.

## Change Log

Flesh LLM tool loop MVP on prove-before-done (#31) (2026-09-26, corvid-agent).
| 2026-09-26 | flesh-full-llm-tool-loop-on-prove-before-done-so-task-run-discord-watch-can-call-allowlisted-plugins-via-openai: Flesh full LLM tool loop on prove-before-done so task run / Discord / WATCH can call allowlisted plugins via OpenAI-compatible tools (issue #31 dogfood MVP) |
| 2026-09-26 | memory-discord-inject: MEMORY system prompt + tool argv (REQ-agent-010) |
| 2026-09-26 | discord-memory-auto-recall-inject-on-spawn-plus-system-prompt-store-recall-rules-agent-7-memory-2-4-draft-67-behavior: Discord MEMORY auto-recall inject on spawn plus system-prompt store/recall rules (AGENT-7 MEMORY-2/4 draft #67 behavior) package 0.0.7 |
| 2026-09-26 | tool-loop-dispatches-only-tools-offered-in-the-run-s-catalog-safe-1-agent-5-pr-128-review-follow-up-a-registered-but: Tool loop dispatches only tools offered in the run's catalog (SAFE-1 / AGENT-5, PR #128 review follow-up): a registered but not-offered (e.g. dangerous or above-tier) plugin name from the model is refused instead of run; memory store test updated for soft-deleted re-store history |
| 2026-09-26 | spawned-agents-ignore-the-project-env-and-tests-never-create-real-worktrees-allow-4-safe-1-session-worktree-3-hygiene: Spawned agents ignore the project .env and tests never create real worktrees (ALLOW-4 / SAFE-1 / SESSION-WORKTREE-3 hygiene): bun-invoked spawns pass --no-env-file so a project worktree's .env cannot inject allowlists, admin lists or keys into the agent; bridge and slash fixture tests use temp project roots so bun test never adds talk/* worktrees or branches to the repo |
| 2026-09-26 | live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one: Live NDJSON event stream for bridges (issue #73, AGENT-8 / CLI-7 / DISCORD-3 / DISCORD-10): task run --output ndjson emits one versioned JSON object per line for StateChanged/Text/ToolCall(redacted argument summary)/ToolResult/VerifyResult, running token usage, and a final result line; Discord and WATCH spawn clients consume the stream and forward state/tool/tokens to onStatus; protocol version 1 to 2 |
| 2026-09-26 | autonomous-1-gate-and-depth-capped-delegate-tool-issue-117: AUTONOMOUS-1 `[corvidinho.autonomous]` gate, SAFE-9 catalog hiding, delegation core with depth / tier / fan-out safety defaults (REQ-agent-117) |
| 2026-09-26 | autonomous-1-gate-and-depth-capped-delegate-tool-issue-117-autonomous-1-5-safe-9-autonomous-mode-off-until-corvidinho: AUTONOMOUS-1 gate and depth-capped delegate tool (issue #117, AUTONOMOUS-1/5, SAFE-9): autonomous mode off until [corvidinho.autonomous] enabled = true in the project fledge.toml; a code-tier lead can delegate a skill-tagged subtask to a worker (child task run, same-or-lower tier, non-interactive, depth <= 2, capped fan-out) and synthesize its summary; delegate stays hidden from the tool catalog unless the session is allowed |
| 2026-09-26 | task-run-reads-the-project-s-own-agents-md-and-claude-md-from-the-project-root-into-the-llm-system-prompt-as-labelled: Task run reads the project's own AGENTS.md and CLAUDE.md from the project root into the LLM system prompt as labelled project instructions (AGENT-1, issue #84 captured slice): 16 KiB cap with truncation marker, symlinks outside the project refused, binary/non-UTF-8 refused, SAFE-6 scrubbed |
| 2026-09-26 | call-registered-fledge-plugins-as-tools-issue-112-fledge-4-5-plugin-2-3-6-discover-the-project-s-fledge-plugins-via-the: Call registered Fledge plugins as tools (issue #112, FLEDGE-4/5 PLUGIN-2/3/6): discover the project's Fledge plugins via the fledge CLI, register each command as a dangerous typed plugin run through fledge plugins run with argv arrays, and show per-command tool schema cost plus a context budget line in plugins list |
| 2026-09-26 | autonomy-1-2-ask-human-tool-and-stuck-owner-ping-on-discord-44: AUTONOMY-1/2 ask-human tool and stuck owner ping on Discord (#44) |
| 2026-09-26 | repo-projects-load-agents-md-and-claude-md-from-the-head-commit-not-the-working-tree-so-the-non-dangerous-file-tools: Repo projects load AGENTS.md and CLAUDE.md from the HEAD commit, not the working tree, so the non-dangerous file tools cannot plant system-prompt instructions for later runs (AGENT-1 hardening, issue #84, review of PR #150) |
| 2026-09-26 | roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat: ROLES-CHAT-2 catalog omit mutating for non-ADMIN |
| 2026-09-26 | harden-child-process-lifetimes-and-fledge-scoping-issue-112-follow-up-to-154-157-167-fledge-plugin-argv-after-own: Harden child process lifetimes and Fledge scoping (issue #112 follow-up to #154, #157, #167): fledge plugin argv after --, own process group plus tree kill on timeout or abort for Fledge runs, delegate workers and schedule runs, daemon shutdown kills abandoned runs, Fledge commands scoped to the project root they were discovered for |
