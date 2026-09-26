# Lesson bundle — release-0-0-15-owner-only-admin-runtime-allowlist-package-bump-changelog-status

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release 0.0.15 owner-only /admin runtime allowlist package bump changelog status
- **Kind**: Operations
- **Specs**: cli
- **Paths**: package.json, tests/version.test.ts, tests/update-helpers.test.ts, .github/workflows/release.yml, CHANGELOG.md, STATUS.md
- **Acceptance**: package.json is 0.0.15; CLI version and Discord presence report v0.0.15 after bridge restart; CHANGELOG has a 0.0.15 section covering /admin ADMIN-1..4 (#147) that extract_changelog_section finds; STATUS records #43/#147 done; release.yml slash list includes /admin; version and update-helpers tests pass.

## Evidence

- Verification commit: `19c9fd31ccfa8e356280c5961478a44d64227489`
- Base commit: `42370b6d06944cc7b01fab42b1c8fdce74efb390`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

#147 already merged owner-only `/admin` (ADMIN-1..4) onto main at package string **0.0.14** (same as the ROLES-CHAT gates tag). Live Discord at `/workspace/Corvidinho-run` was still on gates tip `419b6b4` without `/admin`. Eager 0.0.x bump to **0.0.15** so presence, CHANGELOG announce bullets, and the annotated tag clearly name the ADMIN slash cut.

No living-spec REQ text change: REQ-cli-002 already reads `package.json`; REQ-discord-043 already covers `/admin`.

## From the change's design.md

# Design

Version-only operations cut:

1. `package.json` → `0.0.15`.
2. `CHANGELOG.md` section for 0.0.15 (ADMIN-1..4 bullets; ≤5 short lines for DISCORD-ANNOUNCE-4).
3. `STATUS.md` repo line + Done rows for #43/#147.
4. Version / changelog-helper tests expect `0.0.15`.
5. `.github/workflows/release.yml` slash list includes `/admin` so tag release notes match the nine-command set.

## From the change's testing.md

# Testing

- `bun src/cli.ts version` → `0.0.15`
- `bun test tests/version.test.ts tests/update-helpers.test.ts`
- `bun test` full suite
- `bunx tsc --noEmit`
- `specsync check --require-coverage 100`
- After merge: bridge restart posts `v0.0.15` presence; `/admin` registered (nine guild commands)

## Where these lessons go

- `specs/cli/context.md`
