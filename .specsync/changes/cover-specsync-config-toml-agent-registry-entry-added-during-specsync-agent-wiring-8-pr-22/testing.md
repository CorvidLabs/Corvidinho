---
change: cover-specsync-config-toml-agent-registry-entry-added-during-specsync-agent-wiring-8-pr-22
artifact: testing
---

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
