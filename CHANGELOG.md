# Changelog

## 0.0.4

### Discord

- **`/schedule`** slash for recurring single-project agent runs (DISCORD-SCHEDULE-1..5 / #57 → [#62](https://github.com/CorvidLabs/Corvidinho/pull/62) / `7d81edc`).
  - Subcommands: **list** | **create** | **pause** | **resume** | **delete**.
  - Single-project only (no templates / flock / council / on-chain).
  - Human cadence with a **5-minute minimum** interval.
  - ADMIN mutations re-checked at the handler (empty admin allowlist = deny-all).
  - Schedules persisted in **SQLite** via the shared store (`ScheduleStore`).
  - Cooperative **~60s ticker** that does not starve HEAR / WATCH ingress.
- Discord Custom Status (DISCORD-12) continues to show `vX.Y.Z` from `package.json` via `src/version.ts` — this cut bumps presence to **v0.0.4** after bridge restart (ops).

### Session

- **SESSION durable** SQLite `SessionStore` / `WorkStore` + soft TTL (SESSION-1..4 / [#61](https://github.com/CorvidLabs/Corvidinho/pull/61)) — landed on main after the v0.0.3 tag; kept as the bridge path under `/schedule`.

## 0.0.3

### Ops

- Updater: pidfile `/tmp/corvidinho-discord-bridge.pid` stop/start + ready-wait (`logged in` / protocol OK) with SHA rollback; `docs/UPDATE.md`.
- Release Action: idempotent when the GitHub Release already exists.
- Builds on #45 (tag→Release + `scripts/corvidinho-update.sh` + `docs/BOX-UPDATE.md`).

## 0.0.2

### Dogfood polish

- Shared version helper + richer Discord `/status`; LLM tool loop behind `CORVIDINHO_LLM_*`.
