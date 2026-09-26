# Lesson bundle — discord-bot-presence-shows-shared-corvidinho-package-version-discord-12-set-custom-status-on-clientready-from-src

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord bot presence shows shared Corvidinho package version (DISCORD-12): set Custom Status on ClientReady from src/version.ts; short string e.g. v0.0.3; fixture test; STATUS note; no slash/allowlist churn
- **Kind**: Feature
- **Specs**: discord, cli
- **Paths**: src/discord/gateway.ts, src/discord/bridge.ts, src/version.ts, tests/discord.presence.test.ts, hi/discord.md, STATUS.md, specs/discord/requirements.md, src/discord/presence.ts, src/discord/index.ts, specs/discord/discord.spec.md, specs/discord/testing.md, specs/cli/cli.spec.md
- **Acceptance**: On ClientReady (and after restart), Discord presence/custom status shows short version string from shared src/version.ts/package.json (e.g. v0.0.3); prefer ActivityType.Custom; fixture test covers presence payload without live token; slash registration and allowlists unchanged; STATUS notes DISCORD-12; SpecSync+fledge verify green

## Evidence

- Verification commit: `c58fde0b20d1db84aa8d78edf54ce0f3047dbfeb`
- Base commit: `186620b64e25a2cf6bb41d460c6ddecf20bec240`
- Verified by: `specsync check --spec cli --spec discord`

## From the change's context.md

# Context

Leif wants the live Discord bot to show the Corvidinho package version under the
bot name (custom status / presence) so dogfood can tell which build is running
without opening `/status`. HI criterion DISCORD-12 (confirmed this ask). Shared
version already lives in `src/version.ts` / package.json for CLI and `/status`.

Constraints: HI-first; keep status string short (e.g. `v0.0.3`); prefer Custom
Status via discord.js when supported for bots; do not invent extra status chrome;
do not break slash registration or allowlists; Linux-only; secrets out of repo;
SpecSync + fledge verify green. DISCORD-11 retired after accidental `--help` capture.

## From the change's design.md

# Design

- `formatPresenceVersionString(version)` → `vX.Y.Z` (prefix `v` if missing).
- `buildVersionPresenceActivity(version)` → `{ name: "Custom Status", state: "vX.Y.Z", type: 4 }` (ActivityType.Custom).
- `createLiveGateway(config, handlers, { version })` on ClientReady: `client.user.setPresence({ status: "online", activities: [...] })`; warn-and-continue on failure.
- Bridge default factory passes `version` from package / opts.
- Fallback not needed in code path: discord.js v14 supports Custom + state for bots; Playing/Watching only if we later observe Custom not displaying (out of scope unless live proves otherwise).
- No slash or allowlist changes.

## From the change's testing.md

# Testing

- Unit: `formatPresenceVersionString("0.0.3")` → `v0.0.3`; already-prefixed unchanged.
- Unit: `buildVersionPresenceActivity` → Custom type 4, name `Custom Status`, state `v0.0.3` from VERSION / package.json.
- No live Discord token; slash + allowlist fixtures unchanged.
- `bun test` + `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-017 | `tests/discord.presence.test.ts` — presence payload from shared version; Custom type + short `v*` state |
| REQ-cli-002 | `tests/discord.presence.test.ts` + `tests/version.test.ts` — `formatPresenceVersionString` / VERSION from package.json |

## Automated coverage

- `bun test tests/discord.presence.test.ts tests/version.test.ts`
- `bunx tsc --noEmit`
- `specsync check`
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/discord/context.md`
- `specs/cli/context.md`
