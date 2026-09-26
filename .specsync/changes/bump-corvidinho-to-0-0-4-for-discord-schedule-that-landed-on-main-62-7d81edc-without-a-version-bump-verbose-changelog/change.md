---
id: bump-corvidinho-to-0-0-4-for-discord-schedule-that-landed-on-main-62-7d81edc-without-a-version-bump-verbose-changelog
state: verifying
type: operations
base_commit: 7d81edc9d105fbea329e71deca99bfe05f100a27
---

# Bump Corvidinho to 0.0.4 for Discord /schedule that landed on main (#62 / 7d81edc) without a version bump; verbose CHANGELOG covering /schedule list|create|pause|resume|delete single-project 5m min SQLite schedules ~60s ticker plus SESSION durable (#61); keep presence reading package.json via shared version helper

## Intent

Bump Corvidinho to 0.0.4 for Discord /schedule that landed on main (#62 / 7d81edc) without a version bump; verbose CHANGELOG covering /schedule list|create|pause|resume|delete single-project 5m min SQLite schedules ~60s ticker plus SESSION durable (#61); keep presence reading package.json via shared version helper

## Affected Canonical Specs

- None

## Acceptance Criteria

- package.json is 0.0.4; CHANGELOG has verbose 0.0.4 covering Discord /schedule (list/create/pause/resume/delete, single-project, 5m min, SQLite schedules, ~60s ticker) and SESSION durable (#61); /schedule wrongly under 0.0.3 removed; STATUS/docs/UPDATE + version-asserting tests updated; Discord presence still reads package.json via src/version.ts (formatPresenceVersionString/VERSION); fledge lanes run verify --non-interactive green; no new slash/features

## No-spec Rationale

Release bump only: package.json 0.0.4 + CHANGELOG/STATUS/docs/UPDATE/test fixtures for already-shipped /schedule (#62) and SESSION durable (#61); presence reads package.json via src/version.ts — no canonical HI/spec AC change
