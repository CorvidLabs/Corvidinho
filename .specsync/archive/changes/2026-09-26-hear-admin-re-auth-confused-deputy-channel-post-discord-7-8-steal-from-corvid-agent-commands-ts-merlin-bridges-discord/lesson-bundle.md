# Lesson bundle — hear-admin-re-auth-confused-deputy-channel-post-discord-7-8-steal-from-corvid-agent-commands-ts-merlin-bridges-discord

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: HEAR admin re-auth + confused-deputy channel post (DISCORD-7,8) — steal from corvid-agent commands.ts + Merlin bridges/discord requester check; fixture tests; no ProcessManager; STATUS Done for #13
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/discord, plugins/discord, tests, STATUS.md, .env.example, allowlist.example.toml, docs, specs/discord
- **Acceptance**: Slash dispatch re-checks resolvePermissionLevel + minPermission before admin-shaped handlers (mute/unmute ADMIN); non-admin refused even if Discord UI showed the command (DISCORD-7). discord-post-message verifies requesting user can ViewChannel+SendMessages on target channel when requesting_user_id provided; strict mode refuses missing requester id (DISCORD-8 / Merlin confused-deputy). Fixture tests no live token; default-deny allowlists unchanged; no ProcessManager; STATUS Done for #13 when merged

## Evidence

- Verification commit: `f39a42f91f10cba776ada9b762d98a2d50fceb0d`
- Base commit: `4fe4905f7108a76040cfda937e83bb0133857309`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Issue #13 (DISCORD-7, DISCORD-8): admin re-auth at command run time +
confused-deputy guard when posting to another channel on the requester's
behalf.

Confirmed HI: `hi/discord.md` DISCORD-7 / DISCORD-8. Steal provenance (issue
body; consult only):

- **DISCORD-7** — archived corvid-agent `server/discord/commands.ts`
  `handleInteraction`: `resolvePermissionLevel` then `entry.minPermission`
  **before** handler (~L752–792). Admin-shaped: mute/unmute (and ancestor
  admin/config). Do not trust Discord UI registration alone.
- **DISCORD-8** — Merlin-primary: `bridges/discord` API auth
  (`api-server.ts` requester check + `gateway.verifyRequesterCanSend`
  ViewChannel+SendMessages). Archive `cross-channel-guard.ts` is **advisory
  only** — do not treat as Discord channel ACL.

Depends on HEAR thin + slash (#5/#11). Soft later. No ProcessManager, no iced,
no SQLite mute DB, no invent ACCESS/bounty/MainNet. Default-deny allowlists
unchanged (empty admin lists ⇒ nobody is ADMIN).

Update STATUS.md Done when this slice merges (#13 → this PR).

## From the change's design.md

# Design

## DISCORD-7

Steal shape from corvid-agent `COMMAND_HANDLERS` Map of
`{ handler, minPermission? }`. Dispatch order: channel allowlist → mute/rate →
`resolvePermissionLevel` → `minPermission` floor → handler.

Admin lists (`adminUsers` / `adminRoles`) are default-deny: empty ⇒ no ADMIN.
Mute/unmute are the thin admin-shaped surface (ancestor mute/unmute ADMIN).

## DISCORD-8

Steal Merlin `verifyRequesterCanSend` semantics (ViewChannel + SendMessages),
not archive advisory cross-channel-guard. Pure `evaluateRequesterCanSend(probe)`
for fixtures; injectable checker for plugin; live path uses discord.js
permissionsFor when a token is available. Channel allowlist remains first gate.
Strict mode opt-in via env (Merlin `require_requester_check` analogue).

## From the change's testing.md

# Testing

- Unit: resolvePermissionLevel — admin user/role → ADMIN; muted/deny → BLOCKED;
  empty admin → never ADMIN.
- Slash: non-admin `/mute` refused with not-authorized; admin mute mutates set;
  channel deny still wins first; Discord UI alone cannot skip re-check.
- Requester: evaluateRequesterCanSend — missing channel 404; not in guild /
  cannot send 403; View+Send → ok.
- Plugin: requesting_user_id + deny checker → refuse, no post; allow → dry-run
  ok; strict mode missing requester → refuse.
- No live Discord token; allowlists remain default-deny.
- Lane: `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-011 | `tests/discord.admin-reauth.test.ts` — minPermission re-check on mute/unmute |
| REQ-discord-012 | `tests/discord.requester-perms.test.ts` + post plugin fixtures — confused-deputy |

## Automated coverage

- `bun test tests/discord.admin-reauth.test.ts tests/discord.requester-perms.test.ts tests/discord.post.plugin.test.ts`
- `bunx tsc --noEmit`
- `specsync check --spec discord`
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/discord/context.md`
