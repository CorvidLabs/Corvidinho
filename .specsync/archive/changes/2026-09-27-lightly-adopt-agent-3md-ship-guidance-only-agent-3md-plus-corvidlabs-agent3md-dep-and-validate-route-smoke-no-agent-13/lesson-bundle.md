# Lesson bundle — lightly-adopt-agent-3md-ship-guidance-only-agent-3md-plus-corvidlabs-agent3md-dep-and-validate-route-smoke-no-agent-13

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Lightly adopt agent.3md: ship guidance-only agent.3md plus @corvidlabs/agent3md dep and validate/route smoke; no AGENT-13 runtime wiring
- **Kind**: Feature
- **Specs**: agent
- **Paths**: agent.3md, package.json, bun.lock, tests/agent3md.smoke.test.ts, CHANGELOG.md, STATUS.md, hi/agent.md, docs/agent.3md.md
- **Acceptance**: agent.3md at repo root validates with validateAgent; Agent.route and Agent.get work for guidance-only skill planes in a bun smoke test; package depends on @corvidlabs/agent3md; no tool= bindings that duplicate SAFE plugins; no AGENT-13 runtime loop wiring

## Evidence

- Verification commit: `d2fb33ad73149932f18010edf5a362ce600cb77f`
- Base commit: `9973a2753d922d3b9871c381d650e0374f0ee8d9`
- Verified by: `specsync check --spec agent --spec cli`

## From the change's context.md

# Context

Leif directed a **light** adopt of CorvidLabs/agent-3md (Agents.3MD): ship a
usable guidance-only `agent.3md`, depend on `@corvidlabs/agent3md`, and add a
validate/route/get smoke — **without** replacing hi/, SpecSync, MEMORY,
sessions, or the SAFE plugin registry, and **without** inventing AGENT-13 HI or
wiring progressive disclosure into the agent loop. Magpie/let put `agent.3md`
at the repo root for `let find agents` discoverability.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| REQ-agent-260 | `tests/agent3md.smoke.test.ts` | validateAgent, route/get, no tool= bindings, dep present |

## Automated coverage

- `bun test tests/agent3md.smoke.test.ts`
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/agent/context.md`
