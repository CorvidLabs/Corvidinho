# Lesson bundle — enrich-formatbridgeliveannouncement-with-5-changelog-bullets-for-discord-announce-4-standing-order-package-0-0-11

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Enrich formatBridgeLiveAnnouncement with ≤5 CHANGELOG bullets for DISCORD-ANNOUNCE-4 standing order; package 0.0.11
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/discord/announce.ts, tests/discord.announce.test.ts, CHANGELOG.md, package.json, docs/discord.md, STATUS.md
- **Acceptance**: formatBridgeLiveAnnouncement returns version header plus ≤5 CHANGELOG bullets for the package version; falls back to package description or tip when CHANGELOG missing; posts still only via postAnnouncement to configured announce channel; package 0.0.11; fixture tests + fledge verify green

## Evidence

- Verification commit: `6ba10bd3240aecb2fa8608f4b5eb5aa0426107e4`
- Base commit: `8747a9abb99c2322ea67c40da96fb60bc69172bc`
- Verified by: `specsync check --spec cli --spec discord`

## From the change's context.md

# Context

Leif standing order: every Discord bridge restart/update should post a message
summarizing **new features/version**, not only `bridge live **vX**`.
`formatBridgeLiveAnnouncement` in tip v0.0.10 still returns only the bare
version line. DISCORD-ANNOUNCE-4 already requires posting the update only to
the configured announce channel — this change enriches that note from
CHANGELOG.md (≤5 bullets) without inventing new HI.

## From the change's design.md

# Design

`formatBridgeLiveAnnouncement(version, opts?)` reads CHANGELOG.md (or injected
`changelogText`), takes the `## <version>` section, collects `-` bullets
(skipping Ops-only package/restart/HI-captured lines), truncates each for
Discord, caps at 5. Missing/empty → package description or single tip line.
Still posted only via `postAnnouncement` (DISCORD-ANNOUNCE-4).

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-024 | `tests/discord.announce.test.ts` — postAnnouncement still announce-channel-only / default-deny; ClientReady path unchanged in bridge |
| REQ-discord-025 | `tests/discord.announce.test.ts` — header + ≤5 CHANGELOG bullets; description/tip/header-only fallbacks; real CHANGELOG for 0.0.10; package 0.0.11 |

## Automated coverage

- `bun test tests/discord.announce.test.ts tests/version.test.ts tests/update-helpers.test.ts`
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/discord/context.md`
