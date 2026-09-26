# Changelog

## 0.0.8

### Discord `/announce` (DISCORD-ANNOUNCE-1..6)

- Slash `/announce channel|show` — ADMIN sets/clears a dedicated ops/dev announcements channel via Discord’s native **CHANNEL picker** (never type a snowflake); `/announce show` and `/status` surface the current channel (empty = not configured / default-deny).
- Persist announce channel id in shared SQLite `schema_meta` across restarts.
- After every successful bridge restart, post a short `bridge live vX.Y.Z` note **only** to the configured announcements channel — not to the dogfood/chat allowlist.
- Mutations re-check ADMIN at handler time; empty admin = deny-all.
- Package version **0.0.8** — Discord presence (DISCORD-12) reads `v0.0.8` after bridge restart; **ops must restart the live bridge and re-register slash** (eight-command set). This release does not restart Corvidinho-run.

## 0.0.7

### Memory in Discord chat (AGENT-7 / MEMORY-2/4)

- **Auto-recall inject** on Discord spawn: before `agent.runChat`, recall up to 20 memories for `msg.authorId` and prepend a clear `[Corvidinho memory for this Discord user …]` block (empty scope still gets a one-liner nudging `memory-store`).
- **System prompt** (`src/agent/execute.ts`): trust injected block; call `memory-store` for durable identity/person/project facts; call `memory-recall` before claiming ignorance; never invent memories (draft #67 behavior without new HI ids).
- **Richer memory tool descriptions** + argv examples so the model actually calls `memory-store` / `memory-recall`.
- Bridge logs `[discord] memory inject: N recalled for user …` to stdout (ops: `/tmp/corvidinho-discord-bridge.log`).
- Fixture tests for inject helper + prompt/tool enrichment.
- No `/memory` slash (HI does not define one).

### Ops

- Package version **0.0.7** — Discord presence (DISCORD-12) reads `v0.0.7` after bridge restart (ops must restart live bridge + post channel update; this release does not restart it).

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
