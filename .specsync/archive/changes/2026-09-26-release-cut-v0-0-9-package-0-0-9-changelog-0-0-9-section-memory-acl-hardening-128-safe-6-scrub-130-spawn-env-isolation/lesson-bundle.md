# Lesson bundle — release-cut-v0-0-9-package-0-0-9-changelog-0-0-9-section-memory-acl-hardening-128-safe-6-scrub-130-spawn-env-isolation

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release cut v0.0.9: package 0.0.9, CHANGELOG 0.0.9 section (memory ACL hardening #128, SAFE-6 scrub #130, spawn .env isolation #133, /work restart recovery #135, CLI HI retire #134) and STATUS roadmap rows; version pin tests updated
- **Kind**: Operations
- **Paths**: package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts
- **Acceptance**: package.json and VERSION read 0.0.9; CHANGELOG has a 0.0.9 section covering #128 #130 #133 #134 #135 with ops notes; STATUS roadmap lists them; update helper extracts the 0.0.9 section; tests + SpecSync + fledge verify green

## Evidence

- Verification commit: `ebe1f69ba95a9125fb28fdffb7c60324898873ef`
- Base commit: `2c86c945f7816f01497ee7c8ab324e72b92f9e3b`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# context

Release bookkeeping for v0.0.9 (see change.md acceptance criteria).

## From the change's design.md

# design

Release bookkeeping for v0.0.9 (see change.md acceptance criteria).

## From the change's testing.md

# testing

Release bookkeeping for v0.0.9 (see change.md acceptance criteria).

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
