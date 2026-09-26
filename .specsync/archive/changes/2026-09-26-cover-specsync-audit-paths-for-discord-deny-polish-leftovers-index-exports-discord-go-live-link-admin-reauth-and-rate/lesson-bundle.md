# Lesson bundle — cover-specsync-audit-paths-for-discord-deny-polish-leftovers-index-exports-discord-go-live-link-admin-reauth-and-rate

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Cover SpecSync audit paths for Discord deny polish leftovers: index exports, DISCORD-GO-LIVE link, admin-reauth and rate-mute deny asserts
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: docs/DISCORD-GO-LIVE.md, src/discord/index.ts, tests/discord.admin-reauth.test.ts, tests/discord.rate-mute.test.ts
- **Acceptance**: CI SpecSync change audit passes: the four leftover paths (docs/DISCORD-GO-LIVE.md, src/discord/index.ts, tests/discord.admin-reauth.test.ts, tests/discord.rate-mute.test.ts) are covered by this active change; behavior already verified under archived DENY-1..3 change; no new canonical REQ

## Evidence

- Verification commit: `12aadf7ffc0bf298103dcbea2b8f49ec6045d834`
- Base commit: `5c4dc52158e5480b1efdf99dbab7891c0ba9bce8`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

PR #54 Discord deny polish archived its SDD change, but the tip also touches
four paths not declared on that change: `docs/DISCORD-GO-LIVE.md` (see-also
link), `src/discord/index.ts` (export ALLOWLIST_DENY_TIP / EPHEMERAL_SILENT_ACK),
`tests/discord.admin-reauth.test.ts` and `tests/discord.rate-mute.test.ts`
(deny-path asserts). `specsync change audit` fails until an active change covers
them. No new product behavior beyond audit coverage of already-landed DENY-1..3 work.

## From the change's testing.md

# Testing

## Local gates

- `specsync change audit` (must pass with this cover change active/archived on tip)
- `bun test tests/discord.admin-reauth.test.ts tests/discord.rate-mute.test.ts`
- `specsync check`

## CI

- Spec Sync Action + Bun smoke on PR #54

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| (no-spec) acceptance | Four leftover paths listed on this change; `specsync change audit` green |

## Where these lessons go

- `specs/discord/context.md`
