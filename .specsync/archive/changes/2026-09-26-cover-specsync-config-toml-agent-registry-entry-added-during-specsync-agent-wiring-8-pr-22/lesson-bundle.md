# Lesson bundle — cover-specsync-config-toml-agent-registry-entry-added-during-specsync-agent-wiring-8-pr-22

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Cover .specsync/config.toml agent registry entry added during SpecSync agent wiring #8 / PR #22
- **Kind**: BugFix
- **Paths**: .specsync/config.toml
- **Acceptance**: PR #22 diff vs main includes .specsync/config.toml agent registry entry; covered by this change; bun test + Spec Sync Action green; change archived on same PR

## Evidence

- Verification commit: `2943ffbed6cd3769c93b2914f37e59d489088f6c`
- Base commit: `8fea09f0ebc9e37aa8619e93493d0177ebfaa9af`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

PR #22 SpecSync agent wiring archived its SDD change, but the PR tip also touches `.specsync/config.toml` (adds `agent = "specs/agent/agent.spec.md"` under `[specs]` to mirror `registry.toml`). `specsync change audit` on the PR fails because that meaningful path is not covered by an active change.

No product behavior change beyond documenting coverage of an already-landed agent spec mapping.

## From the change's testing.md

# Testing

## Local gates

- `specsync change audit` (must pass with this cover change active/archived on tip)
- `bun test`
- `specsync check`

## CI

- Spec Sync Action + Bun smoke on PR #22

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| (no-spec) acceptance | `.specsync/config.toml` listed on this change; `specsync change audit` green |

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
