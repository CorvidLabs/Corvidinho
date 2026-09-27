---
change: docs-refresh-after-audit-operator-docs-env-allowlist-templates-and-the-status-roadmap-match-shipped-code-actor-gate
artifact: docs
---

# Docs

- `AGENTS.md` — HI-first list adds `allow` and the DISCORD-ANNOUNCE /
  DISCORD-ASK / SESSION-MULTI / WATCH-RELIABILITY compound ids; bootstrap block
  adds `attribution`, `discord register-commands`, `github watch`, `daemon` and
  notes doctor's env-only checks and the demo `task run` stub.
- `README.md` — current one-line description; requirements (`git`, `fledge` +
  `specsync` required, `hi`/`gh` optional); owner env; #10–#14 shipped; all
  five spec modules; fail-closed allowlist file.
- `STATUS.md` — Repo row through v0.0.27; compound ids; release tags note;
  every "(this PR)" / "→ main" replaced with its PR; blank line inside the Done
  table removed; rows for #151, #165, #170, #173, #189, #204, #208, the 0.0.27
  build fixes; in-flight rows marked shipped; user/role, dry-run and WATCH write
  facts; allowlist example uses role snowflakes and notes fail-closed parsing.
- `CHANGELOG.md` — factual fixes only: #177 project scope, ROLES-CHAT-8
  web-fetch claim, WATCH spawn-log default, 0.0.9 admin-list line superseded by
  #141, WATCH-RELIABILITY capture version, #185/#187/#188 already in v0.0.22.
- `docs/DISCORD-GO-LIVE.md` — intents, user/role semantics, doctor env-only
  checks + `allowlist-file`, dry-run token, AUTONOMY-4 ping, `council` gate,
  daemon abandoned-run kill.
- `docs/BOX-UPDATE.md`, `docs/UPDATE.md` — tag placeholder + untagged cuts,
  dry-run still fetches, doctor checks incl. `allowlist-file`, `.env` autoload,
  schema v9, any `v*` tag, bridge-only restart.
- `docs/WATCH.md` — spawn-log default, scrub-before-clip, ROLES-CHAT-8 reads,
  writes not offered to agent runs, WATCH run limits, full optional env,
  fail-closed start.
- `docs/discord.md` — actor gate in the gate order and /admin flowchart,
  `/status` fields, requester ping, AUTONOMY-5/6/7, footer format, buttons only
  in chat, owner-only ADMIN wording, project scope, restart after every update,
  PR-step allowlist scope, interrupted replies, source map.
- `docs/DAEMON.md` — shutdown kills abandoned runs' process trees.
- `allowlist.example.toml`, `.env.example` — user/role semantics, owner-only
  ADMIN, `OWNER/*`, env file location, token precedence, dry-run token,
  GitHub allowlist + WATCH env vars, reachable rate-limit levels, TTL scope.
