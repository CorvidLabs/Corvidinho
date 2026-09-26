# Lesson bundle — cover-leftover-plugins-list-smoke-test-ts-for-specsync-audit-after-files-search-81-archive

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Cover leftover plugins.list.smoke.test.ts for SpecSync audit after files/search #81 archive
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: tests/plugins.list.smoke.test.ts
- **Acceptance**: tests/plugins.list.smoke.test.ts asserts files-read/files-write/search-grep appear in plugins list; covered for SpecSync change audit after #81 archive; no new module AC

## Evidence

- Verification commit: `1d0306fcc652c233362980eb61a162287ded43c0`
- Base commit: `373b0c69e27a9857138e554e7536e5dd5901d9ba`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

# Context

Cover leftover smoke test path after #81 archive for SpecSync change audit.

## From the change's design.md

# Design

Audit-only cover; no behavior change.

## From the change's testing.md

# Testing

## Local gates

- `bun test tests/plugins.list.smoke.test.ts`
- `specsync change audit` green

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-plugins-081 | plugins.list.smoke.test.ts asserts files-read/write + search-grep |

## Where these lessons go

- `specs/plugins/context.md`
