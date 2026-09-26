---
id: enable-specsync-sdd-change-workflow-and-fix-ci-specsync-bun-install
state: implementing
type: operations
base_commit: eb9d9c6755d49dc92565a4c6f427f0589451f29a
---

# Enable SpecSync SDD change workflow and fix CI SpecSync/bun install

## Intent

Enable SpecSync SDD change workflow and fix CI SpecSync/bun install

## Affected Canonical Specs

- None

## Acceptance Criteria

- SDD enabled (enabled+require_change); workflow-v2 baseline adopted; CI uses CorvidLabs/spec-sync@v6.0.0 with version 6.0.0 and Bun matching bun.lock; bun test and fledge lanes run verify --non-interactive green

## No-spec Rationale

Ops/policy/CI only: enable SDD, adopt workflow-v2 baseline, fix SpecSync Action and Bun pin. No canonical module contracts change.
