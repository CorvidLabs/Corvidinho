# Lesson bundle — cover-non-discord-plugin-reload-after-clearregistry-for-hear-13-fixtures

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Cover non-discord plugin reload-after-clearRegistry for HEAR #13 fixtures
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: src/plugins/builtins.ts, plugins/github, plugins/meta, plugins/specsync
- **Acceptance**: Non-discord plugin loaders re-register after clearRegistry for HEAR #13 fixture suite; get()-guard replaces sticky loaded flags.

## Evidence

- Verification commit: `98fdeb466c44e478a10d7d5c268886c963eb5994`
- Base commit: `3c0fc924bf80cfeaf55e5cfd86aaa6178eca20c6`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

# Context

Cover change for non-discord plugin loaders touched for HEAR #13 fixtures:
`src/plugins/builtins.ts` and github/meta/specsync loaders re-register after
`clearRegistry()`. `plugins/discord` stays under the main discord change.

## From the change's testing.md

# Testing

Full `bun test` + `specsync check --spec plugins`.

## Where these lessons go

- `specs/plugins/context.md`
