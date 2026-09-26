# Changelog

## Unreleased

### Security — memory ACL hardening (#59 follow-up)

- Memory plugins no longer accept `--user`, `--admin`, or `--db` from argv. In the LLM tool loop argv is model-controlled, so the model could previously read or overwrite any user's memories and self-assert ADMIN (MEMORY-ACL-1..4). The acting user and ADMIN now come only from bridge-set env (`CORVIDINHO_ACTING_DISCORD_USER_ID` / `CORVIDINHO_ACTING_IS_ADMIN`).
- ADMIN is re-checked in the plugin handler: the bridge's per-dispatch `CORVIDINHO_ACTING_IS_ADMIN=1` is required (scheduled runs never get ADMIN) and the live config must agree — empty `CORVIDINHO_DISCORD_ADMIN_USERS` + `_ROLES` ⇒ nobody; deny-listed/muted users are never ADMIN; admin user id, or admin roles configured (ADMIN-4).
- `memory-forget` / `memory-override` are real two-phase (SAFE-4): run once for a confirm token (no content), then `--confirm TOKEN` from a new turn within 10 minutes. The token is HMAC-bound to op + actor + memory id + row state (+ override content) and is single-use. No schema change.
- `memory-recall --include-deleted` is ADMIN-only.
- Phase 2 also needs the token to appear in the human's own message (the bridge passes only human-typed tokens), so the model cannot confirm from its own memory.
- Discord / schedule / WATCH spawns run non-interactive (SAFE-1), and the tool loop only runs tools it offered this run — a dangerous plugin can no longer be called by name.
- Re-storing a memory key keeps the prior content as a soft-deleted row instead of overwriting it (no non-admin forget path).
- Discord spawns always overwrite the acting env; WATCH spawns clear it.

## 0.0.6

### Files / search plugins (PLUGIN-1/2, SAFE-2 / #81)

- Typed builtins: `files-read`, `files-write`, `files-edit`, `files-glob`, `files-list`, `files-delete`, `search-grep` (Merlin steal).
- Writes/edits/deletes require capability tier **code** (`minTier: 2`); `files-delete` is dangerous (SAFE-1 allowlist).
- Paths clamp to the plugin cwd (task worktree / project root); `..` and symlink escapes refuse.
- SAFE-2 hard-refuse overwrite/delete of protected infra: `.env*`, `.git`, `fledge.toml`, `specs/**` / `*.spec.md`, keystore basenames — no in-band override.
- Wired into plugin builtins so the LLM tool loop can call them at code tier.
- Fixture tests: happy path + SAFE-2 deny + path escape.

### Ops

- Package version **0.0.6** — Discord presence (DISCORD-12) reads `v0.0.6` after bridge restart (ops must restart live bridge; this release does not restart it).

## 0.0.5

### Session worktrees

- **SESSION-WORKTREE-1..5 / #58**: per-talk / per-schedule-run git worktree isolation so Discord/CLI talks do not bleed cwd or branch state across concurrent conversations.
- Worktree manager (`src/worktree/`): create / remove / park / prune; base dir `{projectSibling}/.corvid-worktrees` or `WORKTREE_BASE_DIR`; branch pattern `talk/{sessionPrefix}`; non-git projects get a scoped directory under the same base.
- Discord `@mention`, `/session start`, and `/work` bind an isolated workspace; optional `project` option on `/session start` and `/work` for explicit selection (no new slash commands). Once set, project never silently switches mid-conversation.
- Soft TTL / new-topic (SESSION-1..3) unchanged; isolation is filesystem/git context, not MEMORY continuity (SESSION-4).
- End / abandon / TTL purge parks or removes the worktree so another talk never silently reuses it as cwd.
- `/schedule` ticks resolve `schedule.project` into that project's worktree/scope, then park after the run (align DISCORD-SCHEDULE single-project path).
- Shared SQLite schema **v4**: `discord_sessions` columns `project`, `worktree_path`, `worktree_branch`, `worktree_state`.

### Ops

- Package version **0.0.5** — Discord presence (DISCORD-12) reads `v0.0.5` after bridge restart (ops must restart live bridge; this release does not restart it).


## 0.0.4

### Memory

- Local SQLite MEMORY in shared `~/.local/share/corvidinho/corvidinho.db` (schema **v3**): conversations, entities, people, personality notes (MEMORY-1..4 / #41).
- Per-user ACL by Discord `owner_user_id` (MEMORY-ACL-1..5 / #59): store/recall scoped to acting user; **ADMIN-only** forget/override including **self-forget**; empty admin/owner = deny-all; refuse without leaking other users' content.
- Soft-delete with `deleted_at` / `deleted_by_user_id` audit fields.
- Plugins: `memory-store`, `memory-recall`, `memory-forget`, `memory-override` (forget/override dangerous + `--confirm` / SAFE-4). No `/memory` slash (HI does not define one).
- Bridge passes `CORVIDINHO_ACTING_DISCORD_USER_ID` / `CORVIDINHO_ACTING_IS_ADMIN` into agent spawns (DISCORD-7 re-check at handler time).

### Ops

- Package version **0.0.4** — Discord presence (DISCORD-12) reads `v0.0.4` after bridge restart.


## 0.0.3

### Discord

- `/schedule` list|create|pause|resume|delete — recurring single-project agent runs (DISCORD-SCHEDULE-1..5 / #57); 5m min cadence; ADMIN mutations; cooperative ~60s ticker that does not starve HEAR/WATCH; SQLite schedules in shared store.

### Ops

- Updater: pidfile `/tmp/corvidinho-discord-bridge.pid` stop/start + ready-wait (`logged in` / protocol OK) with SHA rollback; `docs/UPDATE.md`.
- Release Action: idempotent when the GitHub Release already exists.
- Builds on #45 (tag→Release + `scripts/corvidinho-update.sh` + `docs/BOX-UPDATE.md`).

## 0.0.2

### Dogfood polish

- Shared version helper + richer Discord `/status`; LLM tool loop behind `CORVIDINHO_LLM_*`.
