# Lesson bundle — bump-corvidinho-to-0-0-4-for-discord-schedule-that-landed-on-main-62-7d81edc-without-a-version-bump-verbose-changelog

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Bump Corvidinho to 0.0.4 for Discord /schedule that landed on main (#62 / 7d81edc) without a version bump; verbose CHANGELOG covering /schedule list|create|pause|resume|delete single-project 5m min SQLite schedules ~60s ticker plus SESSION durable (#61); keep presence reading package.json via shared version helper
- **Kind**: Operations
- **Paths**: package.json, CHANGELOG.md, STATUS.md, docs/UPDATE.md, tests/version.test.ts, tests/update-helpers.test.ts, tests/discord.slash.test.ts, tests/discord.schedule.test.ts, tests/discord.presence.test.ts, src/discord/presence.ts
- **Acceptance**: package.json is 0.0.4; CHANGELOG has verbose 0.0.4 covering Discord /schedule (list/create/pause/resume/delete, single-project, 5m min, SQLite schedules, ~60s ticker) and SESSION durable (#61); /schedule wrongly under 0.0.3 removed; STATUS/docs/UPDATE + version-asserting tests updated; Discord presence still reads package.json via src/version.ts (formatPresenceVersionString/VERSION); fledge lanes run verify --non-interactive green; no new slash/features

## Evidence

- Verification commit: `b359f2f18adbac58616388b2442fb6ef20b018cb`
- Base commit: `7d81edc9d105fbea329e71deca99bfe05f100a27`
- Verified by: `specsync check --spec cli --spec discord`

## From the change's context.md

# Context

`/schedule` shipped on main via #62 (`7d81edc`) after the v0.0.3 tag; package.json and Discord presence (via `src/version.ts` → `package.json`) still say 0.0.3. CHANGELOG incorrectly nested `/schedule` under 0.0.3. SESSION durable (#61) also landed after v0.0.3 without a release callout. Ops will restart the Discord bridge after this cut — do not invent features or restart the bridge here.

## From the change's design.md

# Design

Single source of truth remains `package.json` → `src/version.ts` (`VERSION`, `formatPresenceVersionString`) → Discord Custom Status (`src/discord/presence.ts`). No hardcoded bridge version constant. Release via existing `.github/workflows/release.yml` on annotated `v*` tag push.

## From the change's testing.md

# Testing

- `tests/version.test.ts` expects package VERSION 0.0.4
- `tests/update-helpers.test.ts` package.json 0.0.4 + changelog section extract
- slash/schedule/presence fixtures use 0.0.4 where they assert package version
- `fledge lanes run verify --non-interactive` green

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
