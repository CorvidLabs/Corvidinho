---
spec: discord.spec.md
---

## User Stories

- As Leif, I @mention the bot in an allowlisted Discord channel and get a real session stub on my Linux host (DISCORD-1).
- As a user, replies and thread messages continue the same session without hunting for an id (DISCORD-2 / 2.a).
- As an operator, non-allowlisted channels are refused; empty channel lists refuse start (DISCORD-5; default-deny).
- As a user, while the agent thinks I see a live status (time, tool, rough tokens) instead of a silent void (DISCORD-3).
- As an operator, slash commands let me manage sessions, see agents, check status, and drive work tasks without leaving Discord (DISCORD-4).
- As an operator, under the bot name I see the Corvidinho version as a short Discord presence/custom status (DISCORD-12).

## Acceptance Criteria

### REQ-discord-001

The system SHALL start a session stub with a stable session id when the bot is @mentioned in an allowlisted channel (DISCORD-1). The stub MAY spawn `corvidinho task run --no-verify` (or echo); it SHALL NOT port ProcessManager.

Acceptance Criteria
- `routeMessage` on mention in allowed channel returns `kind: "start_session"` with new session id.
- Session stub recorded in SessionStore; no ProcessManager.

### REQ-discord-002

The system SHALL continue the same session id when a user replies to a bot message (DISCORD-2). Inside a Discord thread the system SHALL keep one session id for that thread (DISCORD-2.a).

Acceptance Criteria
- Reply referencing a tracked bot message resumes that session id.
- Thread id map keeps one session per thread.

### REQ-discord-003

The system SHALL only listen and post in allowlisted channels; messages in other channels SHALL be refused quietly or with a short not-authorized reply (DISCORD-5). Checks SHALL use existing `src/allowlist/` Discord helpers where empty channel/user/role lists mean deny-all.

Acceptance Criteria
- Non-allowlisted channel → `kind: "refuse"` / not authorized; no session created.
- `loadBridgeConfig` errors when channels list empty.

### REQ-discord-004

The bridge SHALL load allowlists from file and env. It SHALL require a non-empty channel allowlist and SHALL fail to start if the channel list is empty.

Acceptance Criteria
- DISCORD_CHANNEL_IDS and/or file/env channels union; empty → empty_channels error.

### REQ-discord-005

When DISCORD_TOKEN and DISCORD_BOT_TOKEN are both missing, the CLI/doctor/bridge SHALL explain the requirement and exit cleanly without crashing. Secrets SHALL never be committed to the repo.

Acceptance Criteria
- `corvidinho discord bridge` without token exits non-zero naming DISCORD_TOKEN / DISCORD_BOT_TOKEN and go-live checklist.

### REQ-discord-006

The bridge SHALL check wire protocol version against
`corvidinho --protocol-version` via Merlin-shaped `protocol-version.ts`
(DISCORD-10): hard-fail on a verifiable mismatch; soft-continue if
unverifiable. When the configured bin path ends in `.ts`, the probe SHALL
invoke via `bun` (never posix_spawn the `.ts` path alone — EACCES). Archive
`shared/bridge-protocol.ts` SHALL NOT be used.

Acceptance Criteria
- `corvidinho --protocol-version` prints `CORVIDINHO_PROTOCOL_VERSION` (currently `2`).
- Verifiable mismatch refuses start; unverifiable warns and continues.
- Fixture stub-binary tests cover match/mismatch/unverifiable/timeout.
- `.ts` bin probe uses argv starting with `bun` then the `.ts` path.

### REQ-discord-007

The system SHALL register `discord-post-message` as a dangerous plugin (externally visible write). Non-interactive runs SHALL deny it unless allowlisted (SAFE-1).

Acceptance Criteria
- `plugins list` shows dangerous=true.
- Non-interactive without allowlist → exit 2.


## Out of Scope

Soft later #14. No voice, Angular, AlgoChat, iced, ProcessManager, SQLite mute table.

### REQ-discord-008

While a session is running, the bridge SHALL show a live thinking status in the
channel (elapsed time, and when known: current tool and rough token use) by
posting one progress message and editing it in-place (DISCORD-3). The bridge
SHALL NOT leave a silent void for the duration of `agent.runChat`. Final agent
text SHALL still be posted as a separate reply after the progress message is
marked Done or error. The bridge SHALL NOT introduce ProcessManager.

Acceptance Criteria
- Session start/continue posts a progress embed (or equivalent) before awaiting agent completion.
- Progress edits include elapsed time; optional tool / token segments when provided.
- On success, progress marked Done then final reply posted; on failure, progress marked error.
- Fixture tests cover builders and edit sequence without live Discord token.
- Allowlists remain default-deny; no new secrets in repo.

### REQ-discord-009

Slash command set SHALL include `/schedule` (list|create|pause|resume|delete),
`/announce` (channel|show) and `/admin` (users add | channels add|remove |
config show, REQ-discord-043) in addition to
session/status/agents/work/mute/unmute. Registration overwrites the
**current** body set (nine commands), not a frozen six, seven or eight.
`/session start` and `/work` MAY accept an optional `project` string option
for explicit project selection (SESSION-WORKTREE-4 / REQ-discord-022). No
other new slash command names beyond schedule/announce/admin.

Acceptance Criteria
- `buildSlashCommandBodies()` includes schedule with list/create/pause/resume/delete.
- `buildSlashCommandBodies()` includes announce with channel|show and STRING + autocomplete (searchable channel).
- `buildSlashCommandBodies()` includes admin with users add, channels add|remove and config show groups.
- Session start + work have optional `project`.
- Bodies remain fixture-testable without live Discord.
- Mute/unmute and prior DISCORD-4 commands still present.

### REQ-discord-010

The bridge SHALL apply per-user sliding-window rate limits and an in-memory
mute set so one user cannot melt the box without punishing everyone else
(DISCORD-6). Rate limit and mute checks SHALL run on mention/reply/thread
continue and on slash dispatch after the channel allowlist gate. Optional
`rateLimitByLevel` SHALL override max messages for a numeric permission level
when provided. Mute seed MAY load from env; mute/unmute helpers mutate the
in-memory set (no SQLite in this thin slice). The bridge SHALL NOT introduce
ProcessManager or weaken allowlists. Fixture tests SHALL cover per-user
independence without a live Discord token.

Acceptance Criteria
- Default window 60s / max 10; env override for window/max + muted seed.
- User A rate-limited or muted → refuse A; user B still served.
- `rateLimitByLevel` override applies when permLevel provided.
- Mention/reply/thread continue and slash share the same per-user limits/mutes.
- No ProcessManager; secrets out of repo; default-deny allowlists unchanged.

### REQ-discord-011

The slash dispatcher SHALL resolve the caller's permission level at run time
and SHALL refuse before invoking the handler when the resolved level is below
the command's declared `minPermission` (DISCORD-7). Admin-shaped commands
`/mute` and `/unmute` SHALL require ADMIN. Empty admin user/role allowlists
SHALL mean nobody is ADMIN (default-deny). Discord application-command
registration alone SHALL NOT authorize admin actions. Fixture tests SHALL cover
non-admin refuse without a live Discord token. The bridge SHALL NOT introduce
ProcessManager or weaken channel/user/role default-deny allowlists.

Acceptance Criteria
- Non-admin `/mute`/`/unmute` → not authorized; mute set unchanged.
- Admin user or admin role → mute/unmute mutates in-memory set.
- Channel allowlist refuse still wins before permission re-check.
- Empty admin lists ⇒ no ADMIN; secrets out of repo; no ProcessManager.

### REQ-discord-012

When posting to a Discord channel on a user's behalf (`discord-post-message`
with requesting user id), the system SHALL verify that the requesting user
could post there (ViewChannel + SendMessages) — not only that the bot could
(DISCORD-8 / Merlin confused-deputy). Channel allowlist SHALL still gate first.
Optional strict mode SHALL refuse posts missing requesting user id. Archive
cross-channel-guard advisory SHALL NOT be treated as the ACL. Fixture tests
SHALL cover allow/deny without a live Discord token. The bridge SHALL NOT
introduce ProcessManager or weaken allowlists.

Acceptance Criteria
- Requester lacks send/view → refuse; no post.
- Requester has View+Send + allowlisted channel → may post (dry-run ok in tests).
- Strict mode + missing requesting_user_id → refuse.
- Allowlist deny still wins before requester check.
- No ProcessManager; secrets out of repo; default-deny unchanged.

### REQ-discord-013

The bridge SHALL make Discord image attachments available to the agent as
local files it can look at (DISCORD-9). Steal shape from corvid-agent
`image-attachments.ts`: MIME allowlist jpeg/png/gif/webp, 20MB size cap, max
5 images per message; download at receive time; multimodal blocks + URL
fallback. Merlin localPath: write under `/tmp/corvidinho-images` and include
paths in the agent prompt via `enrichPromptWithImages`. Non-image / oversized
/ failed downloads SHALL be skipped with a notice. The bridge SHALL NOT
introduce ProcessManager or weaken allowlists. Fixture tests SHALL cover
extraction and localPath without a live Discord token or live CDN.

Acceptance Criteria
- Supported image → downloaded + localPath under cache dir; prompt cites path.
- Unsupported MIME / oversize / over-5 → skipped; peers unaffected.
- Fixture tests for appendAttachmentUrls / buildMultimodalContent /
  enrichPromptWithImages; no live token; secrets out of repo; default-deny.



### REQ-discord-014

Discord/WATCH spawn agent clients SHALL build subprocess argv with
`buildCorvidinhoArgv` so `.ts` entrypoints always run under `bun`. When
`task run` stdout is present (ndjson result frame or legacy `--json`), the
Discord chat reply SHALL surface a parsed summary (state / verified /
attempts + summary) rather than dumping raw JSON. Spawns SHALL NOT pass
`--no-verify` — prove-before-done (AGENT-4 / FLEDGE-2) is the default; the
agent loop still skips the verify lane when `filesChanged` is empty so plain
chat stays fast. Fixture tests SHALL cover argv shape and summary parsing
without a live Discord token.

Acceptance Criteria
- `.ts` bin → `["bun", "--no-env-file", bin, "task", "run", ...]`; non-`.ts` → `[bin, ...]`.
- Spawn argv for Discord chat is `task run --task <prompt> --output ndjson` with **no** `--no-verify`.
- Valid result/json stdout → Discord body includes state and summary text.
- Unparseable stdout falls back to truncated stdout/stderr.
- No ProcessManager; allowlists unchanged; secrets out of repo.

### REQ-discord-015

Ephemeral `/status` SHALL use the shared package version (no hardcoded bridge
constant) and SHALL include useful dogfood lines: Corvidinho vX.Y.Z; uptime;
protocol; channels count; sessions / work counts; LLM model + base host from
env when an API key is set (never print the key), else "demo stub"; the six
registered slash command names; optional git tip short SHA when available
without failing offline. Fixture tests SHALL cover formatting without a live
Discord token.

Acceptance Criteria
- Bridge starts with version from `src/version.ts` / package.json (no `BRIDGE_VERSION` literal).
- `/status` ephemeral body includes the fields above.
- With LLM key env set in fixtures → model @ host; without → demo stub; never the key.
- Offline / missing git → omit tip or show without throwing.
- Mute/unmute unchanged; no new slash commands.

### REQ-discord-016

Guild PUT overwrite SHALL register the current `buildSlashCommandBodies()` set
(nine commands including `/announce` and `/admin`) then clear globals when
guild id is set.

Acceptance Criteria
- Guild register path PUTs nine bodies then clears globals.
- Global-only path warns when guild id unset.
- `discord register-commands` CLI still works against live Discord when configured.

### REQ-discord-017

On Discord gateway `ClientReady` (including after bridge restart), the live
gateway SHALL set the bot presence/activity to a short version string derived
from the shared package version (`src/version.ts` / `package.json` — the same
source as `/status`), so operators can see which Corvidinho build is live under
the bot name (DISCORD-12). The system SHOULD prefer Custom Status
(`ActivityType.Custom` / type 4) with state text like `v0.0.3`. The string SHALL
stay short; the system SHALL NOT invent extra status chrome, new slash commands,
or allowlist changes. Fixture tests SHALL cover the presence payload builder
without a live Discord token.

Acceptance Criteria
- Presence activity state/name uses shared VERSION (e.g. `v0.0.3`), not a hardcoded bridge constant.
- Custom type (4) preferred with `state` holding the short version string.
- ClientReady / restart path sets presence; failure to set presence SHALL NOT abort slash registration or the bridge.
- Slash registration bodies and allowlists unchanged.
- Fixture test covers `buildVersionPresenceActivity` / format helper without a live token.

### REQ-discord-018

Operator docs (`docs/discord.md`) SHALL document `/schedule` and `/announce`
alongside the prior slash inventory, DISCORD-SCHEDULE behavior, DISCORD-ANNOUNCE
behavior (announce-only posts; default-deny until set; announcements mermaid
docs-only), MEMORY inject notes, and per-talk worktree isolation, optional
`project` on `/session start` and `/work`, schedule project scope, and
`WORKTREE_BASE_DIR` / `.corvid-worktrees` rooting (SESSION-WORKTREE /
REQ-discord-022).

Acceptance Criteria
- `docs/discord.md` lists `/schedule` subcommands and admin mutation note.
- `docs/discord.md` lists `/announce` subcommands and announcements section with mermaid.
- `docs/discord.md` covers SESSION-WORKTREE behavior and env.
- Deny flowchart / mermaid-docs-only note unchanged in intent.

### REQ-discord-019

Discord `SessionStore` (and `WorkStore`) SHALL optionally persist to a local
SQLite database under the shared Corvidinho data directory
(`~/.local/share/corvidinho/` by default, overridable via `CORVIDINHO_DATA_DIR`)
so session and work stubs survive process restarts (SESSION durable substrate).
Cross-session continuity SHALL use the same shared SQLite file via MEMORY
tables (REQ-discord-021), not a long-lived ProcessManager.

Soft TTL SHALL default to about **45 minutes** (within SESSION-2's 30–60 minute
band), overridable via `CORVIDINHO_SESSION_TTL_MS` clamped to that band.
Continued activity (`touch` / continue paths) SHALL refresh `lastActivityAt`
(SESSION-2). Lookups for sessions idle past the TTL SHALL treat them as expired
and SHALL NOT continue them, so the next eligible mention starts a fresh
session (SESSION-1 / SESSION-3).

The bridge SHALL open the shared DB when starting (unless tests inject
in-memory stores). Schedules and memories MAY share the same SQLite file
(REQ-discord-020 / REQ-discord-021). Fixture tests SHALL cover persist/reload
and TTL expiry without a live Discord token.

Acceptance Criteria
- Session create + bot-message/thread maps reload from SQLite after reopen.
- Work task stubs reload from the same DB after reopen.
- Default TTL ~45m; env override clamped to 30–60m.
- Idle past TTL → getByThread/getByBotMessage/get/list omit or purge; continue path does not resume.
- Activity within TTL keeps continue_session.
- Data dir defaults to `~/.local/share/corvidinho/`; `CORVIDINHO_DATA_DIR` overrides.
- Memories share `corvidinho.db` (schema v3) without a second database.
- No ProcessManager; secrets out of repo; existing allowlists unchanged.
- Fixture tests pass without live Discord token.

Session durable store SHALL additionally persist optional worktree fields
(`project`, `worktree_path`, `worktree_branch`, `worktree_state`) on schema **v4**
without breaking soft TTL behavior (SESSION-WORKTREE / REQ-discord-022). Soft TTL
purge SHALL park or remove the session worktree before dropping the row
(SESSION-WORKTREE-3).

Acceptance Criteria (worktree addendum)
- Schema v4 migration adds worktree columns; reload restores worktree binding.
- Soft TTL purge parks/removes worktree then drops session row.
- Prior TTL fixtures still green.

### REQ-discord-020

Corvidinho SHALL expose Discord slash `/schedule` with subcommands
`list|create|pause|resume|delete` so an admin can create a recurring
single-project agent run with a human-readable cadence (cron, `@hourly` /
`@daily` / …, or `every N minutes|hours`) plus a target `project` and
`prompt` (DISCORD-SCHEDULE-1..2). Pipeline templates, flock, council, and
on-chain extras are out of scope for this requirement.

Mutations (`create|pause|resume|delete`) SHALL re-check ADMIN at handler time
(DISCORD-7 / ADMIN-4); empty admin/owner lists SHALL deny-all. `list` MAY be
used by allowlisted actors after normal channel and rate/mute gates.

Cadence SHALL enforce a minimum interval of **5 minutes** at create time.
Schedules SHALL persist in the shared Corvidinho SQLite database. The bridge
SHALL run a cooperative ~60s ticker that fires due active schedules
asynchronously with a small concurrency cap so live Discord HEAR and GitHub
WATCH ingress remain ≤ ~1 minute (DISCORD-SCHEDULE-4). Schedule ticks SHALL
re-check channel allowlists (and rely on existing SAFE gates) so a schedule
cannot post or act outside channels/repos already allowed (DISCORD-SCHEDULE-3).
Provenance: steal archived corvid-agent schedule slash + scheduler + ADR
(DISCORD-SCHEDULE-5). No ProcessManager. Fixture tests without live Discord.

Acceptance Criteria
- `/schedule` registered with list/create/pause/resume/delete bodies.
- Admin can create with cadence + project + prompt; non-admin / empty admin denied.
- Cadence `<5m` refused; `>=5m` / `@hourly` accepted.
- list/pause/resume/delete behave; pause skips ticks; resume recomputes next_run.
- Optional create `channel` must be allowlisted; tick re-checks before post.
- Tick returns without awaiting agent; concurrent cap respected.
- Schedules reload from shared SQLite after reopen.
- Durable SessionStore/WorkStore from SESSION (#61) remains the bridge path.
- No flock/council/templates/on-chain/ProcessManager; secrets out of repo.
- Fixture tests + SpecSync + fledge verify green.

Schedule ticks SHALL spawn the agent with cwd scoped to the schedule's
`project` worktree (or project-scoped directory), then park/remove that
workspace after the run, while keeping the cooperative non-blocking tick
semantics (SESSION-WORKTREE / REQ-discord-022).

Acceptance Criteria (worktree addendum)
- Tick resolves `schedule.project` → isolated cwd for `runChat`.
- After run, worktree parked/removed (no silent leftover reuse).
- Tick still returns without awaiting agent; concurrency cap unchanged.

### REQ-discord-021

Corvidinho SHALL persist conversations, entities, people, and personality notes
in the shared local SQLite database under `~/.local/share/corvidinho/` (schema
version **3**, table `memories`) so they survive process restart (MEMORY-1..4).
Memory SHALL stay local SQLite only — no on-chain, Trust, or Augur path
(MEMORY-3 / MEMORY-ACL-5).

Each memory row SHALL be scoped to `owner_user_id` (acting Discord user id).
Reads and writes SHALL default to that user’s scope only (MEMORY-ACL-1).

Forget, delete, overwrite, and re-attribute operations SHALL require ADMIN
permission re-checked at handler time (MEMORY-ACL-3/4, ADMIN-4, DISCORD-7),
including **self-forget** of one’s own memories. Empty admin/owner lists SHALL
deny-all for forget/override. A non-admin attempt against another user’s
memories SHALL be refused without leaking the other user’s content
(MEMORY-ACL-2). Soft-delete MAY retain audit fields (`deleted_at`,
`deleted_by_user_id`).

The Discord agent spawn SHALL always overwrite `CORVIDINHO_ACTING_DISCORD_USER_ID`
(empty when the run has no acting user) and `CORVIDINHO_ACTING_IS_ADMIN`, so a
value in the bridge's own environment never leaks into a spawned run. Memory
plugins SHALL read identity only from that env, never from argv
(REQ-plugins-011). The spawn SHALL run non-interactive
(`CORVIDINHO_NON_INTERACTIVE=1`, SAFE-1 / CLI-3) and pass only the confirm
tokens found in the human's message as `CORVIDINHO_ACTING_CONFIRM_TOKENS`
(SAFE-4). Re-storing an existing memory key SHALL keep the prior content as a
soft-deleted row (retrievable by ADMIN) rather than overwrite it, so an update
is never a non-admin forget path (MEMORY-ACL-4).

No Discord slash `/memory` SHALL be invented in this requirement — exposure is
via `MemoryStore` + memory plugins used by the agent/session path. Categories
SHALL be `conversation` | `entity` | `person` | `personality`. Fixture tests
without live Discord SHALL cover CRUD, reload, ACL deny, and admin forget.

Acceptance Criteria
- Schema migrates to v3 with `memories` table and owner/category indexes.
- Store + recall scoped to acting owner; four HI categories accepted.
- Reload after reopen DB returns prior rows (MEMORY-4).
- Non-admin cannot forget/override own or others; empty admin deny-all.
- Admin forget soft-deletes with audit fields; refuse path leaks no content.
- No on-chain memory; no new slash command; no ProcessManager.
- Bridge opens MemoryStore on shared DB; package version bumped for ship.
- Discord spawn env carries the dispatching actor, or an empty actor, never an inherited one; it is non-interactive and carries only human-typed confirm tokens.
- Re-storing a key soft-deletes the prior row instead of overwriting it.
- Fixture tests + SpecSync + fledge verify green.

### REQ-discord-022

Corvidinho SHALL isolate Discord/CLI talks and scheduled single-project runs
in per-talk (or per-schedule-run) git worktrees or project-scoped directories
so filesystem and branch state do not bleed across concurrent conversations
(SESSION-WORKTREE-1..5). Soft session TTL and new-topic rules (SESSION-1..3 /
REQ-discord-019) SHALL remain; isolation SHALL NOT replace MEMORY for
cross-session continuity (SESSION-4 / SESSION-WORKTREE-2).

Project selection SHALL be explicit per talk or schedule. The default project
for a talk is the bridge `projectRoot` unless an optional `project` option is
supplied on existing `/session start` or `/work` (no new slash command names).
Once a session's project is set it SHALL NOT silently switch mid-conversation
(SESSION-WORKTREE-4). `/schedule` ticks SHALL resolve the schedule's `project`
and run the agent in that project's worktree/scope (align DISCORD-SCHEDULE).

Ending, abandoning, or TTL-purging a talk SHALL park or remove its worktree so
another talk never silently reuses it as cwd (SESSION-WORKTREE-3). Provenance:
steal corvid-agent `server/lib/worktree*` — Linux headless only; no ProcessManager
(SESSION-WORKTREE-5). Session worktree bookkeeping SHALL persist on shared
SQLite schema **v4**. Package version SHALL bump to **0.0.5**. Fixture tests
without live Discord.

Acceptance Criteria
- Worktree manager create/remove/park/prune under `.corvid-worktrees` (or `WORKTREE_BASE_DIR`).
- Concurrent talks get distinct worktree paths/branches.
- Continue-session keeps the same project/worktree; no silent mid-talk switch.
- Optional `project` on `/session start` and `/work`; schedule ticks use schedule.project scope.
- TTL purge / end parks or removes worktree (no silent leftover cwd reuse).
- SESSION soft TTL fixtures still pass; MEMORY continuity unchanged.
- Schema migrates to v4 with session worktree columns.
- Package `0.0.5`; docs/STATUS/CHANGELOG updated.
- Fixture tests + SpecSync + fledge verify green.

### REQ-discord-023

When `memoryStore` is available, Discord HEAR spawn SHALL recall memories for
`msg.authorId` (limit ~20) and prepend a clear inject block to the agent prompt
before `agent.runChat` (AGENT-7 / MEMORY-2 / MEMORY-4). Empty scope SHALL still
include a one-liner nudging `memory-store`. Bridge SHALL log inject count.
No `/memory` slash.

Acceptance Criteria
- Inject helper formats `category/key: content` bullets under a fixed header.
- Empty recall → empty one-liner still prepended.
- Missing store / blank user → prompt unchanged (injected=false).
- Bridge logs `[discord] memory inject: N recalled for user …`.
- Fixture tests cover format + enrich (no live Discord).

### REQ-discord-066

Corvidinho SHALL redact vendor-key-looking secrets (GitHub, OpenAI-compatible,
Anthropic, Discord bot, Slack, AWS, Google, JWT, Bearer, PEM private keys) as
`[redacted:<kind>]` before any free text is written to the shared SQLite DB:
session topics, work task descriptions/summaries, schedule names/descriptions/
prompts, schedule run summaries/errors, and memory keys/content (SAFE-6).
Redaction SHALL be idempotent and leave ordinary text unchanged. Because
callers also scrub text written by others (PR diffs, REQ-plugins-093), every
scrub pattern SHALL run in time linear in its input.

When the scrub rules tighten (`SCRUB_RULES_VERSION` increases), the next open
of the shared DB SHALL re-scrub existing rows once and record the version in
`schema_meta` (SAFE-6 re-scrub). No CLI or slash surface is added. Outbound
reply scrubbing and a Discord-admin re-scrub command are draft SAFE-10 and out
of scope until captured.

Acceptance Criteria
- Each vendor shape is redacted; ordinary text is untouched; scrub is idempotent.
- Hostile input (many private-key or JWT openers with no closer) scrubs in linear time.
- Sessions, work tasks, schedules, schedule runs and memories persist scrubbed.
- Rows written before the current rules are re-scrubbed on next open; second open is a no-op.
- Fixture tests use runtime-built fake secrets only.

### REQ-discord-024

(Clarify bridge-live content only.) After every successful bridge restart
(`ClientReady`), when configured, Corvidinho SHALL post the enriched bridge-live
note from `formatBridgeLiveAnnouncement` (REQ-discord-025) via `postAnnouncement`
— never to the general allowlisted chat by default (DISCORD-ANNOUNCE-4). The
bare `bridge live vX.Y.Z` one-liner is the minimum header; ship notes MAY include
≤5 CHANGELOG bullets. Package version history for `/announce` slash itself
remains **0.0.8**; current package is **0.0.11** after this enrichment.

Acceptance Criteria
- ClientReady posts bridge-live note only to announce channel (not dogfood allowlist).
- Note content matches REQ-discord-025 (header + optional ≤5 bullets).
- `/announce` slash + persist behavior from REQ-discord-024 otherwise unchanged.

### REQ-discord-042

Corvidinho SHALL load a durable owner record from bot-VM config (IDENTITY-1,
ALLOW-4): a Discord user snowflake plus optional GitHub login and display
name, from env `CORVIDINHO_OWNER_DISCORD_ID`, `CORVIDINHO_OWNER_GITHUB_LOGIN`,
`CORVIDINHO_OWNER_DISPLAY` and/or an `[owner]` section (`discord_id`,
`github_login`, `display`) in the allowlist file. Env SHALL override the file
per field. The record is re-read on every start, so it survives restarts.
The owner SHALL be matched only by Discord snowflake or case-insensitive
GitHub login, never by display name.

ADMIN SHALL be owner-only (IDENTITY-2, Leif decision on #42). At handler time
(ADMIN-4 / DISCORD-7) `resolvePermissionLevel` SHALL return ADMIN only for
the owner's Discord id, and not when the owner is muted or on the Discord deny
list. `CORVIDINHO_DISCORD_ADMIN_USERS` / `_ROLES` SHALL NOT grant ADMIN. A
missing, blank, or non-snowflake owner id SHALL mean no owner, and with no
owner nobody is ADMIN (IDENTITY-3). When the legacy admin lists are set, or no
owner is configured, the bridge SHALL log a start-up warning that never echoes
ids.

Ephemeral `/status` and `corvidinho doctor` SHALL show whether an owner is
configured plus the display name only, never ids, logins, or tokens.

Acceptance Criteria
- Env and allowlist-file `[owner]` load the owner; env wins per field; reloading the same config yields the same owner.
- The owner matches by Discord snowflake or lowercased GitHub login; the display name never matches.
- The owner resolves to ADMIN; a muted or deny-listed owner does not.
- Admin user/role lists never resolve to ADMIN, with or without an owner; no owner ⇒ nobody ADMIN and admin slash (/mute) is refused for everyone.
- Bridge start warns when the legacy admin lists are set or no owner is configured.
- `/status` (ephemeral) and `corvidinho doctor` show owner configured yes/no plus the display name only.
- Fixture tests only; no live Discord token or network.

### REQ-discord-128

Discord call sites that spawn an agent run on behalf of a human (message
path, `/session start`, `/work`) SHALL pass the human's own words as
`humanText`, separate from the memory/image-enriched prompt. SAFE-4 memory
confirm tokens SHALL be taken only from `humanText`; scheduler runs pass none.

Acceptance Criteria
- A confirm token present only in the enriched prompt (e.g. recalled memory) is not passed as human-supplied.
- Bridge, `/session start` and `/work` pass `humanText`.

### REQ-discord-087

On bridge start with a SQLite-backed WorkStore, work tasks left `queued` or
`running` by a previous process SHALL be marked `failed` with an honest
"abandoned: the bridge restarted while this work was <status>" summary before
any new work is accepted, and each abandoned task's talk session SHALL be
ended (worktree parked, session dropped) so no later talk silently reuses it
as cwd (SESSION-WORKTREE-3). Recovery is idempotent. Resuming work, a durable
queue, priorities and repo locks are out of scope (draft AUTONOMOUS-14).

Acceptance Criteria
- Queued/running tasks from a dead process become failed with an honest summary; completed tasks are untouched.
- A second recovery pass changes nothing.
- Bridge start fails abandoned work and ends its talk session.

### REQ-discord-095

The shared SQLite store SHALL migrate to schema version 5 with an
append-only `audit_log` table whose UPDATE and DELETE are refused by triggers
(SAFE-5). The shared DB SHALL set a busy timeout so concurrent writers wait
instead of failing. The Discord bridge SHALL verify the audit chain at start
(logged) and `/status` SHALL show a one-line chain summary (entries, OK /
BROKEN at #n / unkeyed / unverifiable without key). Tests SHALL isolate the
data directory.

Acceptance Criteria
- Fresh and upgraded DBs reach schema 5 with `audit_log` and its triggers.
- UPDATE/DELETE on `audit_log` raise an append-only error.
- `/status` includes the audit line when the bridge has a DB.

### REQ-discord-043

The bridge SHALL register one owner-only `/admin` slash command with
subcommand groups `users add` (ADMIN-1), `channels add|remove` (ADMIN-2) and
`config show` (ADMIN-3). The dispatcher SHALL require ADMIN and the handler
SHALL re-check ADMIN before doing anything else (ADMIN-4 / DISCORD-7); with
no owner nobody can run it (IDENTITY-2/3).

Mutations SHALL edit only `[discord].users` / `[discord].channels` in the
allowlist file the bridge already reads (the loaded file, else
`CORVIDINHO_ALLOWLIST_FILE`, else `~/.config/corvidinho/allowlist.toml`,
created 0600 when missing), written atomically (temp file in the same
directory, fsync, rename; mode kept) with every other line, section and
comment kept. The live allowlist SHALL be recomputed as file ∪ env and
updated in place so it applies without a restart. Env values SHALL NOT be
written to the file or changed at runtime; the reply SHALL say so.

Empty SHALL stay deny-all: adding a deny-listed id SHALL be refused, and
removing an env-only channel SHALL be refused, as SHALL removing a channel
when no live channel that is not also on `deny_channels` would remain (deny
always wins, so only deny-listed channels left is the same lockout). When
the first user is added while users and roles were both empty, the reply
SHALL warn that unlisted callers now resolve to BLOCKED. Replies SHALL be
ephemeral, show before/after counts and never contain tokens or secrets.
`config show` SHALL list live/file/env counts, owner configured yes/no plus
display, and which knobs are updatable. Each mutation SHALL append SAFE-5
audit rows (`started` before the write, failing closed when the trail is
unavailable, then `ok`/`error`); refusals SHALL append `denied`. The gateway
SHALL flatten subcommand-group options.

Acceptance Criteria
- Non-owner and no-owner callers get ephemeral `not authorized` at dispatch and at the handler; the file is not written.
- `/admin users add` writes only the users line, keeps `[owner]`/`[github]`/comments, updates the live list in place, and warns on the first user.
- `/admin channels add` makes a new channel pass the slash gate without restart; `remove` drops it; env-only and last-channel removals are refused, and so is a removal that would leave only deny-listed channels.
- Deny-listed ids are refused; unreadable/unparsable files are refused untouched; JSON with lossy numeric ids is refused.
- `/admin config show` shows counts by source and updatable knobs, and no token, key or owner id.
- Mutations append `started` + `ok` audit rows with an args digest only; an unavailable audit trail refuses the change.
- Fixture tests only; no live Discord token or network.

### REQ-discord-037

The shared SQLite store SHALL migrate to schema version 6 with a
`watch_sessions` table (id, unique issue key, repo, number, user, topic,
created/last-activity timestamps) for durable WATCH sessions (#37 slice 1).
`watch_sessions.topic` SHALL be listed in SAFE-6 SCRUB_TARGETS so stored
titles are re-scrubbed when the rules tighten.

Acceptance Criteria
- Fresh and v5 DBs reach schema 6 with `watch_sessions`.
- SCRUB_TARGETS includes `watch_sessions.topic` and a re-scrub redacts it.

### REQ-discord-073

The Discord spawn agent client SHALL run
`task run --no-verify --task <prompt> --output ndjson`, read stdout line by
line while the child runs, and forward each frame's live state, current tool,
and token counts to `onStatus` so the thinking embed shows what the agent is
doing (AGENT-8 / DISCORD-3). The reply summary SHALL come from the stream's
`result` frame; when no result frame parses, the client SHALL fall back to
`summarizeTaskRunOutput` over the non-frame stdout, stderr and exit code.
Frame-shaped lines that do not match the bridge's protocol (or are malformed)
SHALL never become reply text; when the binary streamed another protocol and
no result frame parsed, the reply SHALL be a protocol-mismatch notice naming
both versions.
Token counts SHALL be the provider-reported running total when a `usage`
frame arrived, else the existing rough estimate from the summary length.
Because the bridge now depends on the stream, `CORVIDINHO_PROTOCOL_VERSION`
SHALL be `2` and DISCORD-10 lockstep SHALL refuse a binary reporting another
version.

Acceptance Criteria
- Fake-bin fixture printing ndjson drives `onStatus` with planning / tool / token updates in order.
- Summary equals `summarizeTaskResult` of the result frame; garbage lines and stderr do not break parsing.
- Missing result frame falls back to `summarizeTaskRunOutput`.
- A protocol-3 frame's tool output never reaches the reply; the reply is the protocol-mismatch notice.
- Spawn argv ends with `--output ndjson` (no `--json`).
- `checkProtocolVersion` treats a protocol-1 binary as a mismatch; `--protocol-version` prints 2.

### REQ-discord-025

`formatBridgeLiveAnnouncement` SHALL post a Discord-friendly bridge-live note
after every successful restart when an announce channel is configured
(DISCORD-ANNOUNCE-4): a version header `bridge live **vX.Y.Z**` plus a short
bullet list (≤5) of what shipped in the current package version.

Bullets SHALL prefer the matching `CHANGELOG.md` (or RELEASE notes) section for
that version. When CHANGELOG is missing or has no usable bullets, the helper
SHALL fall back to the package description or a single-line tip — never invent
features. Posts remain **only** via `postAnnouncement` to the configured
announce channel (never dogfood allowlist by default).

Package version SHALL bump to **0.0.11**. Fixture tests without live Discord.
No new slash commands; no new HI criteria (implements standing order + existing
DISCORD-ANNOUNCE-4).

Acceptance Criteria
- Header is always `bridge live **vX.Y.Z**`.
- With a CHANGELOG section, body has 1–5 short `-` bullets from that version.
- Missing CHANGELOG / empty section → description or tip fallback (or header-only if none).
- `postAnnouncement` still default-deny / announce-channel-only.
- Package `0.0.11`; docs/STATUS/CHANGELOG updated.
- Fixture tests + SpecSync + fledge verify green.

### REQ-discord-088

After a `/work` run finishes, the handler SHALL try to ship the run's active
git worktree as a **draft** pull request (AUTONOMOUS-3 / GITHUB-2) and SHALL
add exactly one `PR:` line to its reply, above the run summary. A PR SHALL be
opened only when all of these hold, checked before any commit or push:

- the run finished cleanly and its result frame does not report a failed
  verify (AGENT-4);
- the work ran in an active git worktree with a branch, and that worktree has
  uncommitted changes or commits ahead of the merge-base with the remote
  default branch (`refs/remotes/origin/HEAD`, else `main`), with no conflicts;
- `git-push` and `github-pr-create` — plus `git-commit` when the tree is
  dirty — are in the non-interactive plugin allowlist (GITHUB-5 / SAFE-1);
- the push remote's OWNER/REPO passes the GitHub repo gate (GITHUB-6);
- the tree passed `fledge lanes run verify --non-interactive`: taken from the
  run's result frame when it reports `verified`, else run once in the worktree
  before anything is pushed (AGENT-4).

The steps SHALL run through the existing typed plugins with
`nonInteractive: true` — `git-commit` (explicit paths from `git status`),
`git-push`, then `github-pr-create --draft --head <talk branch> --base
<default branch>` — so SAFE-1 denial and SAFE-5 audit apply. The PR body
SHALL be built from the real diff against the merge-base (name-status file
list, diffstat, commit subjects) plus the verify result, with repo, model and
chat text inside code fences, and title, body and commit message SHALL be
secret-scrubbed (SAFE-6). The Discord spawn client SHALL pass the result
frame's `verified` / `verifySkipped` / `state` through as
`AgentSpawnResult.task`. When a gate fails or a step errors, the `PR:` line
SHALL say plainly why and SHALL NOT claim a PR. No new slash command, option,
env var, table or column.

Acceptance Criteria
- A dirty verified worktree with the three plugins allowlisted is committed, pushed and opened as a draft PR whose body lists the changed files, diffstat, commits and verify result.
- Missing allowlist entries are named in the reply and nothing is committed, pushed or verified.
- A failed run, failed verify, scoped (non-git) dir, clean tree, conflicts or repo-gate refusal opens no PR and says why in one line.
- An unverified run triggers one verify-lane run in the worktree before push; a failing lane ships nothing.
- Push or PR-create failure yields a plain line and never a claimed PR.
- Fixture tests use temp repos, a local bare remote, the dry-run github plugin and a mocked verify lane.
- A /work by anyone other than ADMIN (the owner) never runs the PR step (ROLES-CHAT-3); the reply says the changes stay on the work branch.
- Nothing is committed or pushed unless the worktree HEAD is the work branch and not the base; a switched or detached HEAD opens no PR.

### REQ-discord-085

Discord `createSpawnAgentClient` SHALL always hold chat/schedule runs to the
prove-before-done gate (AGENT-4 / FLEDGE-2 / issue #85 captured slice): spawn
argv MUST NOT include `--no-verify`. Empty `filesChanged` continues to skip
verify inside the agent loop (honest `verifySkipped`); when tools report file
changes, `fledge lanes run verify` runs before done. Draft AGENT-14/15 are out
of scope. Package version SHALL bump to **0.0.13**. Fixture tests without live
Discord.

Acceptance Criteria
- Discord spawn argv never includes `--no-verify`.
- Package `0.0.13`; docs/STATUS/CHANGELOG updated.
- Fixture tests + SpecSync + fledge verify green.

### REQ-discord-108

The Discord bridge and `corvidinho daemon` may tick schedules from one data
dir at the same time (CLI-8 / AUTONOMOUS-4). Schedule ticks SHALL then stay
correct:

- Each tick SHALL re-read the `schedules` table first, so schedules created,
  paused, resumed or deleted by another process are seen.
- Each due run SHALL be claimed with a compare-and-set on `status = 'active'`
  and the `next_run_at` the ticker saw. A run another ticker already claimed
  SHALL be skipped, so each due run fires exactly once.
- Store updates SHALL write only the columns they own. Status changes write
  status / next_run_at / updated_at; run start writes last_run_at /
  execution_count / next_run_at / updated_at; run finish writes
  consecutive_failures (counted in SQL) / updated_at. A run finishing in one
  process SHALL NOT undo a pause or resume made in another.
- The scheduler SHALL record each run's outcome exactly once, even when a
  shutdown abandons a run that later returns.

Existing tick behaviour is unchanged: the 60 s poll, max 2 concurrent runs,
no catch-up, auto-pause after 5 failures, and the non-blocking tick
(DISCORD-SCHEDULE-4). No schema change.

Acceptance Criteria
- Two tickers on one DB file start a due run once; one run row, `execution_count` 1.
- A tick sees create/pause/resume/delete made through another store handle.
- A pause made while a run is in flight survives that run finishing.
- Failures from two handles with stale caches still count to 2.
- `abandonInFlight` records a stuck run as failed once; a late agent result does not record it again.

### REQ-discord-044

When a spawned run's `result` carries a valid `ask`, the HEAR mention/reply
path SHALL reply to the requester with the question instead of the summary or
a bare `failed (exit N)` line (AUTONOMY-1), and SHALL mention the configured
owner (IDENTITY-1) on the post's first line (AUTONOMY-2). The post SHALL limit
allowed mentions to the owner plus the replied-to author, SHALL scrub secrets
(SAFE-6) and defang `@everyone` / `@here` in the model's text, and SHALL end
with a hint that replying answers (DISCORD-2 continues the session). The
thinking status SHALL end as "Needs your input" (clarify) or failed "Stuck"
(stuck). With no owner configured the question SHALL still post with no
mention and the bridge SHALL log a warning (IDENTITY-3).

A scheduled tick whose run carries an ask SHALL post the question with the
schedule line as prefix and the same owner mention to the schedule's channel,
only when that channel passes the allowlist (DISCORD-SCHEDULE-3). Pings SHALL
go only where the bridge already posts: no DMs, no new channels, no new slash
commands.

A schedule SHALL ping the owner once per question: the scheduler SHALL
persist a digest of the pinged ask (reason plus SAFE-6 scrubbed question,
never the text) on the schedule row (schema v7 `schedules.ask_ping_key`), and
a later tick whose ask has the same digest SHALL still post the question but
SHALL NOT mention anyone (`mentionUserIds: []`). The marker SHALL be cleared
when a run succeeds without an ask or the schedule is paused or resumed, and a
different question or reason SHALL ping again. A failed run without an ask
SHALL keep the marker. With no owner configured no marker is recorded.

A `/work` run whose result frame reports state `blocked` SHALL NOT be shipped
as a pull request (REQ-discord-088): the PR step SHALL stop before any
repository, plugin or verify call and its `PR:` line SHALL say the run is
waiting for an answer (skip reason `needs-input`).

Acceptance Criteria
- Mention path: an ask reply quotes the question and carries `<@owner>` plus `mentionUserIds: [owner]`.
- A stuck ask on a failed run replaces `failed (exit N)` with the question and a failed thinking status.
- No owner: question posts, no mention, `mentionUserIds: []`.
- Runs without an ask keep the plain reply with no mention restriction.
- The spawn client passes a valid `result.ask` through and drops a malformed one.
- Scheduler ask posts carry the schedule prefix, the question, and the owner mention.
- The same schedule question pings once; repeat ticks post it with no mention.
- A changed question or reason pings again; a clean run or pause/resume re-arms the ping; a failed run keeps the marker.
- The marker persists in SQLite (schema v7) across a restart or a second ticker on one data dir.
- A blocked `/work` run opens no PR, says it is waiting for an answer, and makes no repository, plugin or verify call.

### REQ-discord-204

While an agent run is in flight for a Discord session (bridge
mention/reply/thread chat, `/work`, `/session start`), the session SHALL
count as busy: the soft-TTL purge on `get`, `getByThread`,
`getByBotMessage` and `list` SHALL NOT drop that session or park/remove its
worktree, however long the run takes (SESSION-WORKTREE-3: only an ended or
abandoned talk is parked). The end of a run SHALL count as activity and
refresh `lastActivityAt` (SESSION-2). Once no run is in flight, a session
idle past the TTL SHALL still be purged and its worktree parked as before
(REQ-discord-019 / REQ-discord-022).

Acceptance Criteria
- A lookup past the TTL during a run keeps the session, its worktree, and the agent's uncommitted edits.
- `/work` and `/session start` replies keep the Worktree line after a run longer than the TTL.
- The bridge can track the bot reply for a run longer than the TTL (no dropped session row).
- After a run, an idle session past the TTL is purged and its worktree parked.
- No new env vars, slash commands, or schema changes.

