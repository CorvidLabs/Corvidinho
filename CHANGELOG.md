# Changelog

## 0.0.12

### Typed git tools (#82) — [#145](https://github.com/CorvidLabs/Corvidinho/pull/145)

- New builtins `git-status`, `git-diff`, `git-log` (safe) and `git-branch-create`, `git-commit`, `git-push` (dangerous, SAFE-1: denied non-interactive unless allowlisted) — PLUGIN-1/2, GITHUB-2.
- Project root only (SAFE-3); never stages `.env*` or keystores, and a branch switch refuses to overwrite ignored files (SAFE-2); git hooks never run from these tools; no force/amend/rebase exposed.
- `git-push` checks the remote's OWNER/REPO against the GitHub allow/deny lists (GITHUB-6). Draft SAFE-22 (refuse default-branch commits) awaits HI.

### Durable WATCH sessions (#37) — [#142](https://github.com/CorvidLabs/Corvidinho/pull/142)

- WATCH sessions keyed by `owner/repo#number` persist in the shared SQLite (**schema v6** `watch_sessions`; topic scrubbed, SAFE-6) with a soft idle TTL (default 45m) and survive restarts (SESSION-1..3).
- Shutdown is clean: after SIGTERM the poller never acks or spawns again; poll cycles never overlap; one failing event is logged and skipped instead of blocking the rest.

### Ops

- Package version **0.0.12** — presence (DISCORD-12) reads `v0.0.12` after restart.
- **Restart `github watch` and the Discord bridge** so the git tools and the schema v6 migration are picked up (the DB migrates on first open).

## 0.0.11

### Discord announce enrichment (DISCORD-ANNOUNCE-4 standing order)

- **DISCORD-ANNOUNCE-4** — `formatBridgeLiveAnnouncement` posts version header plus ≤5 CHANGELOG bullets for what shipped (REQ-discord-025).
- Prefer `CHANGELOG.md` section for the package version; fall back to package description or a single tip line when missing.
- Still posts **only** to the configured announce channel via `postAnnouncement` — never dogfood allowlist by default.
- Fixture tests for formatter + announce-channel-only post.

### Ops

- Package version **0.0.11** — presence (DISCORD-12) reads `v0.0.11` after restart.
- **Restart the Discord bridge** so ClientReady posts the richer bridge-live note.

## 0.0.10

### ⚠ Upgrade notes

- **Restart the bridge, `github watch` and the checkout together.** The wire protocol is now `2` (DISCORD-10); a new bridge refuses an old binary.

### WATCH reliability (WATCH-RELIABILITY-1..3)

- **WATCH-RELIABILITY-1** — After a successful auto-ack on mention/comment start/continue, post a short agent summary comment on the same GitHub thread when the run finishes (success or failure), once per event id (Made with Corvidinho footer).
- **WATCH-RELIABILITY-2** — Persist spawn outcome logging (start, exit code / error class, duration) as a structured `[watch] spawn …` log line and durable JSONL (`CORVIDINHO_WATCH_SPAWN_LOG` or `~/.local/share/corvidinho/watch-spawn.jsonl`) — readable without Discord.
- **WATCH-RELIABILITY-3** — On GitHub **403 rate-limit**, back off using `Retry-After` / `x-ratelimit-reset` (documented default **60s**); skip tight re-poll loops; clear `[watch] github rate-limit backoff` log line.
- HI captured in [`hi/watch.md`](hi/watch.md) (not draft).

### Ops

- Package version **0.0.10** — presence (DISCORD-12) reads `v0.0.10` after restart.
- **Restart `github watch`** to pick up summary comments, spawn JSONL, and rate-limit backoff.

_Backfilled: these shipped in the tagged build but were missing from the first notes for this version._

### Live NDJSON event stream for bridges (#73) — [#139](https://github.com/CorvidLabs/Corvidinho/pull/139)

- `task run --output text|json|ndjson`; `--json` stays an alias and its output is unchanged.
- `--output ndjson` writes one versioned JSON object per line as the run progresses: `StateChanged`, `Text`, `ToolCall` (a truncated, secret-scrubbed argument summary — never raw args), `ToolResult`, `VerifyResult`, running provider-reported `usage`, and a final `result` frame (summary capped at 4000 chars).
- The Discord thinking embed and WATCH read the stream live: current state, current tool, and the real running token total when the provider reports usage (AGENT-8 / CLI-7 / DISCORD-3).
- Frames from another protocol are never turned into reply text; the reply becomes a "protocol mismatch — restart the bridge" notice. Unoffered tool names show as "(unknown tool)".

### Security fix — `--task` text can no longer become CLI flags — [#143](https://github.com/CorvidLabs/Corvidinho/pull/143)

- The bridges pass untrusted Discord/GitHub text after `--task`. A message such as `--tier=code` or `--no-verify` used to lose its task text and be parsed as a flag, letting message text pick the capability tier. `--task` now always takes the next argv item; `--task=TEXT` keeps multi-line text (AGENT-5 / SAFE-1).

## 0.0.9

### ⚠ Upgrade notes

- **Set the owner before deploying.** ADMIN is now owner-only (IDENTITY-2). Set `CORVIDINHO_OWNER_DISCORD_ID` (or `[owner] discord_id` in the allowlist file) on the box. With no owner, nobody is ADMIN: `/mute`, `/unmute`, `/announce`, `/schedule` mutations and memory forget/override refuse everyone (IDENTITY-3 default-deny). `CORVIDINHO_DISCORD_ADMIN_USERS` / `_ROLES` are ignored; the bridge and `doctor` warn when they are set.

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

_Backfilled: these shipped in the tagged build but were missing from the first notes for this version._

### IDENTITY: durable owner record (#42) — [#138](https://github.com/CorvidLabs/Corvidinho/pull/138), owner-only ADMIN — [#141](https://github.com/CorvidLabs/Corvidinho/pull/141)

- Owner = Discord snowflake + optional GitHub login + display name, from `CORVIDINHO_OWNER_DISCORD_ID` / `_GITHUB_LOGIN` / `_DISPLAY` or the allowlist file `[owner]` section (env wins per field); survives restarts; the display name never matches anything (IDENTITY-1, ALLOW-4).
- The owner is the only ADMIN, re-checked at handler time in the bridge, slash dispatch and the memory plugins; muted or deny-listed owner is not ADMIN (IDENTITY-2/3, ADMIN-4).
- `/status` and `doctor` show "owner configured yes/no" plus the display name only — never ids, logins or tokens.

### SAFE-5 tamper-evident audit trail (#95) — [#136](https://github.com/CorvidLabs/Corvidinho/pull/136)

- Every dangerous plugin run appends HMAC-chained `started` → `ok`/`error` (or `denied`) rows to `audit_log` in the shared DB (schema v5, append-only triggers); raw args are never stored, only a digest; a dangerous run is refused if its `started` row cannot be written.
- `verifyAudit` finds the first tampered row; key from `CORVIDINHO_AUDIT_HMAC_KEY`. Draft SAFE-17 (wider coverage, Discord verify) awaits HI.

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
