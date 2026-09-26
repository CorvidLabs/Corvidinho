# Changelog

## 0.0.9

### Security — memory ACL hardening (#59 follow-up) — [#128](https://github.com/CorvidLabs/Corvidinho/pull/128)

- Memory plugins no longer accept `--user`, `--admin`, or `--db` from argv. In the LLM tool loop argv is model-controlled, so the model could previously read or overwrite any user's memories and self-assert ADMIN (MEMORY-ACL-1..4). The acting user and ADMIN now come only from bridge-set env (`CORVIDINHO_ACTING_DISCORD_USER_ID` / `CORVIDINHO_ACTING_IS_ADMIN`).
- ADMIN is re-checked in the plugin handler: the bridge's per-dispatch `CORVIDINHO_ACTING_IS_ADMIN=1` is required (scheduled runs never get ADMIN) and the live config must agree — empty `CORVIDINHO_DISCORD_ADMIN_USERS` + `_ROLES` ⇒ nobody; deny-listed/muted users are never ADMIN; admin user id, or admin roles configured (ADMIN-4).
- `memory-forget` / `memory-override` are real two-phase (SAFE-4): run once for a confirm token (no content), then `--confirm TOKEN` from a new turn within 10 minutes. The token is HMAC-bound to op + actor + memory id + row state (+ override content) and is single-use. No schema change.
- `memory-recall --include-deleted` is ADMIN-only.
- Phase 2 also needs the token to appear in the human's own message (the bridge passes only human-typed tokens), so the model cannot confirm from its own memory.
- Discord / schedule / WATCH spawns run non-interactive (SAFE-1), and the tool loop only runs tools it offered this run — a dangerous plugin can no longer be called by name.
- Re-storing a memory key keeps the prior content as a soft-deleted row instead of overwriting it (no non-admin forget path).
- Discord spawns always overwrite the acting env; WATCH spawns clear it.

### SAFE-6 secret scrub before persist (#66) — [#130](https://github.com/CorvidLabs/Corvidinho/pull/130)

- One redaction module (`src/store/scrub.ts`) on every SQLite write path: session topics, work tasks, schedules + runs, memory key/content. GitHub, OpenAI-compatible, Anthropic, Discord bot, Slack, AWS, Google, JWT, Bearer and PEM private-key shapes → `[redacted:<kind>]`.
- Re-scrub when rules tighten: opening the DB re-scrubs stored rows once whenever `SCRUB_RULES_VERSION` increases (first start after this release scrubs rows already written by #61/#64).
- Draft SAFE-10 (outbound replies, Discord-admin re-scrub) and Algorand mnemonics wait for HI capture.

### Spawned agents ignore the project `.env` — [#133](https://github.com/CorvidLabs/Corvidinho/pull/133)

- Spawns run with cwd = the talk's project worktree; Bun would auto-load that project's `.env*` into the agent. `.ts` spawns now run `bun --no-env-file`, so a worked-on repo cannot inject allowlists, admin lists or keys (ALLOW-4 / SAFE-1).
- `bun test` no longer creates real `talk/*` worktrees next to the repo.

### Restart recovery for `/work` (#87, SESSION-WORKTREE-3) — [#135](https://github.com/CorvidLabs/Corvidinho/pull/135)

- On bridge start, work left queued/running by a dead process is marked failed with an honest summary and its talk ended (worktree parked). Durable queue/locks/resume stay draft AUTONOMOUS-14.

### HI

- CLI-1, CLI-2, CLI-6, CLI-9 retired — no human CLI; humans use Discord/GitHub (#129 → [#134](https://github.com/CorvidLabs/Corvidinho/pull/134)).

### Ops

- Package version **0.0.9** — presence (DISCORD-12) reads `v0.0.9` after restart.
- **Restart the Discord bridge and `github watch`** so spawns pick up the hardened memory plugins, non-interactive SAFE-1, `--no-env-file`, and the one-time secret re-scrub. No slash re-register needed (command set unchanged). No schema migration beyond what main already had.
- Operators running `corvidinho plugins run memory-*` by hand now set `CORVIDINHO_ACTING_DISCORD_USER_ID` (+ admin env for forget/override) instead of `--user`/`--admin`; forget/override confirm tokens must be supplied by a human.
- Bot config belongs in the VM env / `~/.config/corvidinho/` — a `.env` inside a worked-on project is ignored by spawned agents.

### Shell plugin + SAFE-3 cwd clamp (#83)

- Typed builtin `shell-exec` (PLUGIN-1): `sh -c` with stdout/stderr merged; **dangerous** + `minTier: code` (PLUGIN-2); SAFE-1 allowlist in non-interactive.
- **SAFE-3:** spawn cwd pinned to plugin/project root; lexical refuse of `cd`/`pushd` that would escape (absolute outside, `..`, `~`, `$VAR`, bare `cd`) before spawn — Merlin steal.
- Exports `CORVIDINHO_PROJECT_ROOT` into the child env for nested tools.
- Fixture tests: happy path, SAFE-1 deny, SAFE-3 escape refuse, relative-within-root allow.
- `docs/hi-drafts/WATCH-RELIABILITY.md` — draft only for Leif (post-ack summary, spawn outcome log, 403 backoff); **not** captured to `hi/`.
- After restart, typed `shell-exec` + SAFE-3 cwd clamp are available to the LLM tool loop.


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
