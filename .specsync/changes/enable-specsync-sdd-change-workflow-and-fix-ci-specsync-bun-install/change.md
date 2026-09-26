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

- Dedicated Spec Sync workflow uses CorvidLabs/spec-sync@v6 (version 6.0.0, strict, require-coverage 100) plus specsync change audit; ci.yml has no SpecSync curl/install and keeps Fledge v1.7.2 release install + verify; Bun 1.4.2 pin; sdd.json enabled with require_change_for_meaningful_files true.

## No-spec Rationale

Ops/policy/CI only: enable SDD, adopt workflow-v2 baseline, fix SpecSync Action and Bun pin. No canonical module contracts change.
