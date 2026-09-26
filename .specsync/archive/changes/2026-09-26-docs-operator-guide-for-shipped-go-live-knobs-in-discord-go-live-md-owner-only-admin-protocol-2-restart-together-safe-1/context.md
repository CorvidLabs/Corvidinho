---
change: docs-operator-guide-for-shipped-go-live-knobs-in-discord-go-live-md-owner-only-admin-protocol-2-restart-together-safe-1
artifact: context
---

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
