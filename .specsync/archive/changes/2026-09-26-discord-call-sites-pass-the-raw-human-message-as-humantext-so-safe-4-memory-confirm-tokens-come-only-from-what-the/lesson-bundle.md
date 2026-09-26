# Lesson bundle — discord-call-sites-pass-the-raw-human-message-as-humantext-so-safe-4-memory-confirm-tokens-come-only-from-what-the

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord call sites pass the raw human message as humanText so SAFE-4 memory confirm tokens come only from what the human typed (PR #128, after #131 memory inject)
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/discord/bridge.ts, src/discord/command-handlers/session.ts, src/discord/command-handlers/work.ts, specs/discord/
- **Acceptance**: Bridge message path, /session start and /work pass the raw human message as humanText; the spawn env carries only confirm tokens found in humanText; a token present only in the memory-enriched prompt is not treated as human-supplied (fixture in tests/memory.spawn-env.test.ts); tests + SpecSync + fledge verify green

## Evidence

- Verification commit: `1eab6b863a89e4ef9fc766655e8dd75ba8059b15`
- Base commit: `a2fff442b44fef198ec6f6a6246eb361c5a8d12b`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

#131 (merged) prepends recalled memory to the Discord spawn prompt. PR #128 extracts SAFE-4 confirm tokens for memory forget/override from the human's message; reading them from the enriched prompt would let a token the model stored in memory look human-typed. The call sites now pass the raw human text separately.

## From the change's design.md

# Design

Call-site threading only; `AgentRunChatOpts.humanText` lives in `src/discord/agent-client.ts`.

## From the change's testing.md

# Testing

- `tests/memory.spawn-env.test.ts` — tokens only from `humanText`; enriched-prompt token ignored.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-128 | `tests/memory.spawn-env.test.ts` |

## Where these lessons go

- `specs/discord/context.md`
