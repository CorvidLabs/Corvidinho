# Lesson bundle — safe-default-deny-allowlists-for-github-orgs-repos-users-and-discord-channels-roles-users-file-env-config-on-bot-vm

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: SAFE: default-deny allowlists for GitHub orgs/repos/users and Discord channels/roles/users; file+env config on bot VM; empty allowlist denies all; AlgoChat wallets deferred (WALLET HI only); integrates GITHUB-6; Discord stub for HEAR #5
- **Kind**: Feature
- **Specs**: plugins, cli
- **Paths**: src/, plugins/, tests/, hi/, STATUS.md, README.md, docs/
- **Acceptance**: Empty/missing allowlist refuses targeted GH plugin runs and Discord channel posts/listens (default-deny); allow match passes; deny override wins; file+env load (CORVIDINHO_ALLOWLIST_FILE or ~/.config/corvidinho/allowlist.toml|json); Discord stub API for HEAR; HI allow.md ALLOW/WALLET captured; STATUS/README document VM config; wallets deferred (no wallet code); bun test + fledge verify + Spec Sync CI green

## Evidence

- Verification commit: `0e46bfc058e622f37e96119cf0ed7ff207be404b`
- Base commit: `33a6c7f74ef2c2521c5c6ea2de8e552551552e0c`
- Verified by: `specsync check --spec cli --spec plugins`

## From the change's context.md

# Context

Issue #16 / Leif CoS 2026-09-26: default-deny allowlists before HEAR go-live / widening ACT.
HI confirmed in `hi/allow.md` (ALLOW-1..6, WALLET-1..3). Existing GITHUB-6 treated empty
`CORVIDINHO_GITHUB_ALLOW_REPOS` as allow-all — Merlin-shaped foot-gun (empty permissions → BASIC).
This change flips to empty/missing = deny-all for GH repo/org/user and Discord channel/role/user.
Wallets: HI + STATUS deferral only; no wallet ACT code. HEAR #5 still blocked on wiring this API.

## From the change's design.md

# Design

- Lean Bun/TS `src/allowlist/{types,load,github,discord,index}.ts`
- File: TOML or JSON; path from `CORVIDINHO_ALLOWLIST_FILE` else `~/.config/corvidinho/allowlist.{toml,json}`
- Env overlays merge over file (lists union for allow/deny where set)
- Default-deny: no allow entries for that surface ⇒ refuse (not Merlin empty→BASIC)
- Deny lists always win; GH org allow matches `owner/*` style; repo patterns `owner/repo` or `owner/*`
- Discord stub: `checkChannel` / `checkRole` / `checkUser` for HEAR
- Wallets: document deferral only

## From the change's testing.md

# Testing

## Local gates

- `bun test` (default-deny allowlist, GITHUB-6, Discord stub, SAFE-1 deny)
- `bunx tsc --noEmit`
- `bun src/cli.ts --help`
- `hi check`
- `specsync check`
- `specsync change audit`
- `fledge lanes run verify --non-interactive`

## CI

- **ci** smoke: Bun install/test/typecheck only
- **Spec Sync**: CorvidLabs/spec-sync@v6 + `specsync change audit` (no Fledge Actions)

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-plugins-004 | `tests/github.deny.test.ts` + `tests/github.deny.cli.test.ts` (empty deny-all, allow match, deny override) |
| REQ-plugins-005 | `tests/allowlist.default-deny.test.ts` empty≠BASIC + Discord empty deny; github.deny empty allow |
| REQ-plugins-006 | `tests/allowlist.default-deny.test.ts` file+env toml overlay load |
| REQ-plugins-007 | `tests/allowlist.default-deny.test.ts` checkChannel/Role/User |
| REQ-cli-005 | `tests/cli.smoke.test.ts` --help; STATUS.md / README.md allowlist VM notes |

## Where these lessons go

- `specs/plugins/context.md`
- `specs/cli/context.md`
