# Lesson bundle — tool-loop-dispatches-only-tools-offered-in-the-run-s-catalog-safe-1-agent-5-pr-128-review-follow-up-a-registered-but

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Tool loop dispatches only tools offered in the run's catalog (SAFE-1 / AGENT-5, PR #128 review follow-up): a registered but not-offered (e.g. dangerous or above-tier) plugin name from the model is refused instead of run; memory store test updated for soft-deleted re-store history
- **Kind**: BugFix
- **Specs**: agent
- **Paths**: src/agent/execute.ts, tests/agent.tool-loop.test.ts, tests/memory.store.test.ts, specs/agent/
- **Acceptance**: The LLM tool loop only runs plugins present in the tool catalog it offered for this run (tier + danger filtered); any other registered name (e.g. dangerous danger-ping or memory-forget when dangerous tools are not offered) returns a refused tool result and never reaches runPlugin even in interactive mode with an allowlist; offered tools behave as before; memory store fixture reflects soft-deleted re-store history; fixture tests + SpecSync + fledge verify green

## Evidence

- Verification commit: `808a88df1c08b8f6d7b4f9ee8b1a48f57ea7bc6d`
- Base commit: `a9feb0fde12d55d7625957eb869ce49665c631d3`
- Verified by: `specsync check --spec agent --spec discord`

## From the change's context.md

# Context

PR #128 review (ACL-bypass lens) and an end-to-end probe showed the tool loop
passed any model-supplied tool name straight to `runPlugin`. Dangerous plugins
are left out of the offered catalog, but a model could still call them by
name, and Discord/WATCH spawns ran interactive so SAFE-1 never denied them.
The spawn side is fixed in the companion memory-hardening change; this change
closes the dispatch side in `src/agent/execute.ts`.

## From the change's design.md

# Design

`const offered = new Set(tools.map((t) => t.function.name))` in
`runToolLoop`; dispatch `runPlugin` only when `offered.has(name)`, else a
synthetic refused result. The refusal is fed back to the model as a normal
tool message so the loop continues.

## From the change's testing.md

# Testing

- `tests/agent.tool-loop.test.ts` — not-offered dangerous tool refused even
  interactive + allowlisted; existing offered-tool loop tests unchanged.
- `tests/memory.store.test.ts` — re-store keeps soft-deleted history.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-agent-128 | `tests/agent.tool-loop.test.ts` |

## Where these lessons go

- `specs/agent/context.md`
