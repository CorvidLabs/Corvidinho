# Lesson bundle — docs-operator-guide-for-shipped-go-live-knobs-in-discord-go-live-md-owner-only-admin-protocol-2-restart-together-safe-1

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Docs: operator guide for shipped go-live knobs in DISCORD-GO-LIVE.md (owner-only ADMIN, protocol 2 restart-together, SAFE-1 CORVIDINHO_ALLOWLIST entries with registry flags, daemon under systemd, AUTONOMOUS-1 gate, ROLES-CHAT for non-owners, audit and spawn log locations) plus stale-fact fixes in BOX-UPDATE.md and .env.example (issue #5)
- **Kind**: Documentation
- **Paths**: docs/DISCORD-GO-LIVE.md, docs/BOX-UPDATE.md, .env.example
- **Acceptance**: docs/DISCORD-GO-LIVE.md has an operator guide section covering owner-only ADMIN, protocol 2 restart-together, the SAFE-1 CORVIDINHO_ALLOWLIST entries with dangerous/minTier/mutating flags printed from the plugin registry, corvidinho daemon under systemd, the AUTONOMOUS-1 fledge.toml gate, ROLES-CHAT behavior for non-owner users, and where the audit log and spawn logs live; every command, env var and config key named exists in code on main; docs/BOX-UPDATE.md and .env.example no longer state stale facts (slash count and names, schema version, admin wording, restart modes); no source file changes

## Evidence

- Verification commit: `c8223c5b974c9148665891ab4a7ba782f3285bb7`
- Base commit: `cfcf2b7c6ab71ed46ce4f319969c26bc3c599c0f`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

Part of #5 (HEAR go-live ops). Many operator-facing knobs shipped in v0.0.9 through v0.0.19
and were described only in scattered CHANGELOG entries: owner-only ADMIN, protocol 2
restart-together, SAFE-1 `CORVIDINHO_ALLOWLIST` entries for the dangerous tools that shipped
(web-fetch, fledge-*, git writes, github-pr-create for `/work` PRs, shell-exec, memory
forget/override), `corvidinho daemon` under systemd, the AUTONOMOUS-1 `fledge.toml` gate,
ROLES-CHAT for non-owner users, and where the audit chain and spawn logs live.
`docs/BOX-UPDATE.md` and `.env.example` still carried stale facts (six-command slash set,
schema v3, "empty admin" wording, restart modes without the pidfile default).

Every fact was checked against the code on `main` at base commit cfcf2b7:

- tool flags printed from the plugin registry by a throwaway script (builtins plus the
  project's Fledge plugins), matching `corvidinho plugins list`;
- env names, log strings, table names and file names checked by a second throwaway
  script against `src/`, `plugins/` and `scripts/` (51 names, 26 literals, none missing);
- the nine slash commands counted from `buildSlashCommandBodies()` and `SLASH_COMMAND_NAMES`.

Findings recorded in the guide as current behavior on `main` (not new criteria):

- `task run` never turns on `includeDangerous`, so dangerous plugins are not offered to the
  model; an allowlist entry takes effect for non-interactive `plugins run`, the bridge's
  `/work` PR step and delegate workers (same wording as `docs/discord.md` Memory).
- `doctor` runs before the updater sources `CORVIDINHO_ENV_FILE`, and its Discord check
  reads env only (not the allowlist file).
- Chat, `/session` and `/work` are gated by channel allowlist, mute and rate limit only;
  user/role/deny-list gating for them is in review in #176.

No source, spec, or HI change. Draft HI ids are not touched.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
