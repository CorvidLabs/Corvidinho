---
id: enable-specsync-sdd-change-workflow-and-fix-ci-specsync-bun-install
state: verifying
type: operations
base_commit: eb9d9c6755d49dc92565a4c6f427f0589451f29a
---

# Enable SpecSync SDD change workflow and fix CI SpecSync/bun install

## Intent

Enable SpecSync SDD change workflow and fix CI SpecSync/bun install

## Affected Canonical Specs

- None

## Acceptance Criteria

- Dedicated Spec Sync workflow uses CorvidLabs/spec-sync@v6 (version 6.0.0, require-coverage 100; strict false for draft bootstrap). ci.yml is Bun-only (smoke/test/typecheck) with no SpecSync curl and no Fledge install. sdd.json enabled with require_change_for_meaningful_files true. Fledge verify remains a local/agent gate.

## No-spec Rationale

Ops/policy/CI only: enable SDD, adopt workflow-v2 baseline, fix SpecSync Action and Bun pin. No canonical module contracts change.
