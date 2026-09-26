# Lesson bundle — fix-discord-watch-spawn-always-bun-invoke-ts-for-protocol-handshake-and-agent-client-parse-task-run-json-for-discord

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Fix Discord/WATCH spawn: always bun-invoke .ts for protocol handshake and agent-client; parse task run --json for Discord summary; thin env-gated LLM execute stub; STATUS dogfood go-live note
- **Kind**: BugFix
- **Specs**: discord, watch, agent, cli
- **Paths**: src/discord/protocol-version.ts, src/discord/agent-client.ts, src/watch/agent-client.ts, src/agent/execute.ts, src/agent/spawn-argv.ts, src/agent/task-summary.ts, src/agent/index.ts, src/cli.ts, tests/agent.execute.test.ts, tests/discord.protocol-version.test.ts, tests/spawn.argv.test.ts, .env.example, STATUS.md
- **Acceptance**: buildCorvidinhoArgv always prefixes bun for .ts bins; protocol-version + discord/watch createSpawnAgentClient use it (no EACCES posix_spawn of .ts alone); fixture tests assert spawn argv shape; Discord surfaces parsed task run --json summary (state/summary) not raw dump; thin env-gated LLM execute when CORVIDINHO_LLM_API_KEY set else demo stub; .env.example documents CORVIDINHO_LLM_* without secrets; STATUS notes Discord go-live done + LLM gap/issue; SpecSync + fledge verify green; no #9; allowlists unchanged

## Evidence

- Verification commit: `c3e3a23b9f7a179bddf9e64a4b6ca71a3d10db7b`
- Base commit: `a8068ad5073cb7401518f9f996b988db9740f00c`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec watch`

## From the change's context.md

# Context

Live Discord HEAR on Leif's box (corvid-agent#1110) logged:
`couldn't verify protocol version (spawn failed: EACCES: permission denied, posix_spawn '.../src/cli.ts')`
then soft-continued. Root cause: `checkProtocolVersion` / `Bun.spawn([bin, ...])` when
`CORVIDINHO_BIN` defaults to `src/cli.ts` tries to posix_spawn the `.ts` path alone.
`task run` from Discord is still demo-execute only — dogfood needs reliable spawn + a
useful `--json` summary back to Discord; full LLM tool loop is a follow-up issue.

Constraints: HI-first (no invent ACCESS/bounty/MainNet); do not touch #9; do not weaken
allowlists; secrets never in repo; prefer `--no-verify` for bridge latency.

## From the change's design.md

# Design

- New `src/agent/spawn-argv.ts`: `buildCorvidinhoArgv`.
- Wire into `src/discord/protocol-version.ts`, `src/discord/agent-client.ts`, `src/watch/agent-client.ts`.
- New `src/agent/task-summary.ts` (`summarizeTaskRunOutput`) for JSON parse → Discord body.
- New `src/agent/execute.ts`: `createTaskExecute` / `loadLlmEnv` — env-gated; demo fallback preserves verify-gate exercise when no key.
- CLI `taskRun` uses `createTaskExecute` instead of inline demo.
- Follow-up GitHub issue (dogfood label) for full LLM tool loop (AGENT-3/5 flesh).

## From the change's testing.md

# Testing

- Unit: `buildCorvidinhoArgv` for `.ts` → bun prefix; binary path unchanged.
- Protocol: live `src/cli.ts` probe via bun returns match (no EACCES).
- summarizeTaskRunOutput: valid JSON → state+summary; garbage → truncated stdout/stderr.
- execute: no key → demo; mocked fetch with key → LLM summary path (no live API in CI).
- `bun test` + `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-agent-006 | `tests/spawn.argv.test.ts` — `.ts` bun prefix / non-`.ts` unchanged |
| REQ-agent-007 | `tests/agent.execute.test.ts` — demo no-key + mocked LLM fetch |
| REQ-cli-007 | `tests/agent.cli.test.ts` — task run --no-verify --json + help |
| REQ-discord-006 | `tests/discord.protocol-version.test.ts` — stub + live `.ts` bun probe match |
| REQ-discord-014 | `tests/spawn.argv.test.ts` + `summarizeTaskRunOutput` cases; discord agent-client uses helper |
| REQ-watch-006 | `src/watch/agent-client.ts` uses `buildCorvidinhoArgv`; argv covered in `tests/spawn.argv.test.ts` |

## Automated coverage

- `bun test tests/spawn.argv.test.ts tests/agent.execute.test.ts tests/discord.protocol-version.test.ts tests/agent.cli.test.ts`
- `bunx tsc --noEmit`
- `specsync check`
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/discord/context.md`
- `specs/watch/context.md`
- `specs/agent/context.md`
- `specs/cli/context.md`
