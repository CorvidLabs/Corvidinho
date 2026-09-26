# Lesson bundle — steal-specsync-agent-wiring-from-merlin-fledge-plugin-specsync-typed-list-read-check-brief-coverage-change-list-ship

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: STEAL SpecSync agent wiring from Merlin fledge-plugin-specsync: typed list/read/check/brief/coverage + change list/ship-status; Planning companion briefing; SpecSync check blocks prove-before-done (SPECSYNC-1..7); plan-time list/read + verify-lane spec-check; CI Spec Sync Action remains dedicated
- **Kind**: Feature
- **Specs**: agent, plugins, cli
- **Paths**: src/agent, src/cli.ts, src/plugins, plugins/specsync, fledge.toml, tests, STATUS.md, AGENTS.md, specs/
- **Acceptance**: Agent/CLI can list and read specs/ via typed plugins (specsync-list/read) and CLI; companion brief loads context.md/tasks.md/etc when modules targeted (SPECSYNC-5); plan-time Merlin spec_loader list/read feeds Planning; spec-check is on lanes.verify so SpecSync check failures block prove-before-done verified=true (SPECSYNC-2/7); CI Spec Sync Action remains a dedicated workflow alongside Bun smoke; coverage and change list/ship-status available when asked; no SpecSync API key; bun test + SpecSync Action green; change archived

## Evidence

- Verification commit: `0985c8387899c1c5661240e6cdecaad9d56d9840`
- Base commit: `b55ff627783de1b7d5ce5c0ed9c75c618d9b546b`
- Verified by: `specsync check --spec agent --spec cli --spec plugins`

## From the change's context.md

# Context

Issue #8: STEAL SpecSync agent wiring from Merlin `fledge-plugin-specsync` + plan-time `spec_loader.rs`. SDD already ON — do **not** reimplement SpecSync. Wire list/read/check as typed plugins the agent loop can call; feed Planning + done-gate via verify-lane `spec-check`.

Already on main: plugin host (#15), default-deny allowlists (#18), prove-before-done agent loop (#17). Planning still emits a placeholder ("specs briefing deferred"). `fledge.toml` has `[tasks.spec-check]` but verify lane does **not** run it yet (STATUS previously kept SpecSync only in the dedicated CI Action).

Merlin steal targets:
- `plugins/fledge-plugin-specsync/` — `specsync-list|read|check` (+ create out of first slice)
- `crates/merlin-core/src/spec_loader.rs` — token-overlap select + constraint extract at Planning
- `fledge.toml` `[lanes.verify]` includes `spec-check`

Out of scope: #19, iced UI, SpecSync cloud/API key, Trust/Augur/Attest, inventing ACCESS/bounty/MainNet.

## From the change's design.md

# Design

**Plugins (not a second SpecSync):** list/read parse project files the same way Merlin’s plugin does. check shells out to `fledge run spec-check` (fallback `specsync check`). coverage / change list / ship-status spawn the local SpecSync binary.

**Plan-time:** `loadRelevantSpecs(cwd, task)` → list names → `select_relevant_specs(task, names, 3)` → read each → `extract_constraint_sections` + companion snippets → return briefing string. Loop emits `Text` during Planning. Soft-fail if registry/plugins missing (Merlin returns Ok(())).

**Done-gate:** add `spec-check` to `[lanes.verify]` so existing `defaultVerifyRunner` (`fledge lanes run verify`) already blocks on SpecSync. Do not invent a parallel SpecSync-only gate in the loop. CI `.github/workflows/spec-sync.yml` stays.

**CLI:** thin `corvidinho specsync <list|read|check|brief|coverage|change-list|ship-status>` forwarding to plugins for operator ergonomics.

## From the change's testing.md

# Testing

## Local gates

- `bun test` (specLoader + SpecSync plugins + Planning briefing + existing suites)
- `bunx tsc --noEmit`
- `bun src/cli.ts specsync list`
- `bun src/cli.ts task run --task "agent loop" --no-verify --json`
- `specsync check`
- `specsync change audit`
- `fledge lanes run verify --non-interactive` (includes spec-check)

## CI

- **ci** Bun install/test/typecheck (no Fledge)
- **Spec Sync** CorvidLabs/spec-sync@v6 + change audit

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-agent-004 | `tests/agent.loop.test.ts` Planning SpecSync briefing; `tests/specLoader.test.ts` |
| REQ-agent-005 | `tests/agent.loop.test.ts` fledge.toml verify lane includes spec-check |
| REQ-plugins-008 | `tests/specsync.plugins.test.ts` list/read/brief + plugins list names |
| REQ-cli-007 | `tests/specsync.plugins.test.ts` CLI list/read/help; task --task via agent loop test |

## Where these lessons go

- `specs/agent/context.md`
- `specs/plugins/context.md`
- `specs/cli/context.md`
