# Lesson bundle — enable-specsync-sdd-change-workflow-and-fix-ci-specsync-bun-install

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Enable SpecSync SDD change workflow and fix CI SpecSync/bun install
- **Kind**: Operations
- **Paths**: .github/, .specsync/sdd.json, .specsync/config.toml, .specsync/registry.toml, .specsync/version, .specsync/adoption-report.json, .specsync/workflow-v2-baseline.json, AGENTS.md, STATUS.md, package.json, bun.lock, tsconfig.json, fledge.toml, src/, tests/, specs/, hi/, docs/
- **Acceptance**: Dedicated Spec Sync workflow uses CorvidLabs/spec-sync@v6 (version 6.0.0, require-coverage 100; strict false for draft bootstrap). ci.yml is Bun-only (smoke/test/typecheck) with no SpecSync curl and no Fledge in GHA. sdd.json enabled; active change covers BOOT meaningful paths vs main. Fledge verify remains a local/agent gate.

## Evidence

- Verification commit: `c4b209a2691a4771ba6dae92aa048104fab47965`
- Base commit: `eb9d9c6755d49dc92565a4c6f427f0589451f29a`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

PR #1 CI failed with `specsync: command not found` (install.sh 404). CoS/Leif
override for early Corvidinho CI (2026-09-26):

1. REQUIRED: SpecSync GH Action `CorvidLabs/spec-sync@v6` (version 6.0.0) —
   dedicated workflow. No curl|bash SpecSync.
2. Do NOT require Fledge in GitHub Actions yet.
3. CI = Bun smoke/tests/typecheck + SpecSync Action only.
4. Fledge verify stays in the local/agent SpecSync SDD change cycle.
5. Later: add pinned `CorvidLabs/fledge@` + `lanes run verify` when verify
   lane grows past spec-check.

`strict: false` on the Action because the bootstrap CLI spec is still
`status: draft` (draft warning would fail `--strict`).

## From the change's design.md

# Design

- **SDD policy**: single source of truth `.specsync/sdd.json`; change workspaces under `.specsync/changes/`.
- **CI SpecSync**: prefer official composite Action for `specsync check`. Separately ensure a `specsync` binary is on PATH so Fledge's `spec-check` task (`specsync check`) succeeds inside `fledge lanes run verify`.
- **Bun pin**: align `oven-sh/setup-bun` version with the lockfile that ships in-repo (1.4.2 / lockfileVersion 2).
- No product CLI/API behavior changes in this change.

## From the change's testing.md

# Testing

## Local (agent)

- `specsync check --force` exits 0 (draft warning OK without --strict)
- `specsync change audit` exits 0
- `fledge lanes run verify --non-interactive` green (local gate; not in GHA yet)

## CI

- **ci** smoke: Bun install + smoke + test + typecheck only
- **Spec Sync**: Action check (coverage 100, not strict) + `specsync change audit`

## Rejection signal

SpecSync curl|bash install, Fledge required in GHA, or `sdd.json` enabled false.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
