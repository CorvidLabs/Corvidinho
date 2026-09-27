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

The system SHALL continue the same session id when a user replies to a bot message (DISCORD-2). Inside a Discord thread the system SHALL keep one session id for that thread (DISCORD-2.a), one for each user in it (SESSION-MULTI-1, REQ-discord-046).

Acceptance Criteria
- Reply referencing a tracked bot message resumes that session id.
- Thread map keeps one session per thread for each user, keyed by thread id and Discord user id; another user's session in the thread never replaces it.
- The answer message of `/session start` and `/work` is a tracked bot message of the session that slash command created: the thinking message it was collapsed into (DISCORD-ASK-7), or, when collapse fails, the deferred slash reply when the gateway returns its message id.
- After a user runs `/session start` (or `/work`) twice (topics A then B), that user's reply to A's answer resumes session A, with the reply ping on and with it off; it never runs in session B and is never dropped.
- Another user's reply to that answer never resumes the session, even when that user is the configured owner (ADMIN) (SESSION-MULTI-1): with the ping off it is ignored, with the ping on it starts or continues that user's own session.

### REQ-discord-003

The system SHALL only listen and post in allowlisted channels; messages in other channels SHALL be refused quietly or with a short not-authorized reply (DISCORD-5). Checks SHALL use existing `src/allowlist/` Discord helpers where empty channel/user/role lists mean deny-all.

Acceptance Criteria
- Non-allowlisted channel → `kind: "refuse"` / not authorized; no session created.
- `loadBridgeConfig` errors when channels list empty.

### REQ-discord-004

The bridge SHALL load allowlists from file and env. It SHALL require a non-empty channel allowlist and SHALL fail to start if the channel list is empty.

When the allowlist file exists but cannot be read or parsed (REQ-plugins-006),
`loadBridgeConfig` SHALL return `code: "allowlist"` and the bridge SHALL NOT
start; it SHALL NOT fall back to env channels alone. Multi-line
`[discord]` arrays (`channels`, `users`, `deny_*`) SHALL load in full.
`/admin` (REQ-discord-043) SHALL read a multi-line `users` / `channels`
array in full and SHALL refuse (not rewrite) a file it cannot parse. It SHALL
find the lines to edit with the loader's own reader, so a `]` or `#` inside a
quoted item neither ends an array nor starts a comment, and a key it adds goes
after the closing `]` of any multi-line array. Before any write it SHALL
re-read the new text exactly as the loader will after a restart and SHALL
refuse, writing nothing, unless it loads, the edited list reads back as
intended and every other list and key (`[owner]` included) is unchanged — so
a file it rewrites always reloads with every existing entry and every other
list intact.

Acceptance Criteria
- DISCORD_CHANNEL_IDS and/or file/env channels union; empty → empty_channels error.
- A malformed allowlist file → `allowlist` error; the bridge does not start.
- A multi-line `deny_channels` loads and refuses its channel.
- `/admin users add` on a file with a multi-line `users` array keeps the existing entries, and the reloaded file keeps `deny_users` and `[github].deny_repos`.
- `/admin users add` on a file whose `[discord]` has only a multi-line `channels` array (LF and CRLF), and `/admin channels add` after a multi-line `deny_users`, put the new key after the closing `]`; the file reloads with every list intact.
- A `]` or `#` inside a quoted item survives an `/admin` rewrite; the comment on the edited key's first line is kept.
- A rewrite that would not reload as intended (an entry the one-line writer cannot quote) is refused and the file is left byte-for-byte unchanged.

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

The permission level that `rateLimitByLevel` (`DISCORD_RATE_LIMIT_BY_LEVEL`)
keys on SHALL be the actor's level from `resolvePermissionLevel` (user id,
role ids, allowlist, configured owner; mutes are checked before the rate
limit) on both the chat path (`routeMessage`) and slash dispatch, unless a
caller passes an explicit level (`RouterDeps.rateLimit.permLevel` /
`SlashContext.permLevelFor`). `/mute` SHALL refuse a target that is the
invoker or the configured owner (IDENTITY-2) with an ephemeral message and
SHALL leave the mute set unchanged, so the owner can never mute themselves
out of ADMIN and `/unmute` until restart. MessageCreate has no ephemeral:
a muted or rate-limited user's @mention/reply/thread message SHALL get at
most one public notice (`MUTED` / `RATE_LIMITED`) per user per rate-limit
window (`claimRefusalNotice`); later refusals in that window SHALL be
silent, still with no session and no agent run. Slash refusals SHALL stay
ephemeral on every call (DISCORD-DENY / Discord's 3 s ack). No new env var,
slash command, table or column.

Acceptance Criteria
- Default window 60s / max 10; env override for window/max + muted seed.
- User A rate-limited or muted → refuse A; user B still served.
- `rateLimitByLevel` override applies when permLevel provided.
- Mention/reply/thread continue and slash share the same per-user limits/mutes.
- No ProcessManager; secrets out of repo; default-deny allowlists unchanged.
- With `DISCORD_RATE_LIMIT_MAX=3` and `DISCORD_RATE_LIMIT_BY_LEVEL={"3":100}`, the owner's 4th and later `/status` and @mentions in the window are served; a member's 4th `/status` gets an ephemeral "Slow down!" and a member's 4th @mention is refused.
- A member who passes only by an allowed role is limited at the STANDARD (2) level max on chat and slash; an explicit `permLevelFor` still overrides.
- Owner `/mute user:<owner>` gets an ephemeral refusal and the owner is not muted; `/unmute` and `/status` still work for the owner. Any invoker's `/mute` of the configured owner, and a self-mute with no owner configured, are refused the same way. `/mute` of another user still mutes them.
- A muted user who sends 5 @mentions gets exactly one public reply and no session or agent run; a rate-limited user (max 1) who sends 5 gets one public "Slow down!"; a peer is still served.
- After a notice, a muted user's reply-to-bot in the same window is refused silently; once the window has passed since that notice, the next refusal notifies once again.
- A muted user's `/status` gets the ephemeral `MUTED` reply on every call and nothing is posted publicly.

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
fallback. Merlin localPath: the bridge SHALL bind the session workspace first
and then write the files inside the directory the agent runs in
(`<session cwd>/.corvidinho/attachments/`, via
`attachmentCacheDir(store.cwdFor(session))`), never under a shared `/tmp`
dir, and SHALL include those paths in the agent prompt via
`enrichPromptWithImages`, so the agent's `files-read` (which refuses paths
outside its cwd) can open them; `files-read` SHALL hand the model the image
itself as an image part, not decoded bytes (REQ-plugins-427 /
REQ-agent-428). The attachment dir SHALL carry a self-ignoring `.gitignore`
so images never land in a commit, and SHALL be removed with the workspace
when the session ends or expires
(SESSION-WORKTREE-3). Non-image / oversized / failed downloads SHALL be
skipped with a notice. The bridge SHALL NOT introduce ProcessManager or
weaken allowlists. Fixture tests SHALL cover extraction and localPath without
a live Discord token or live CDN.

Acceptance Criteria
- Supported image → downloaded + localPath under cache dir; prompt cites path.
- Bridge: the cited path is under `<session cwd>/.corvidinho/attachments/`;
  opening the cited path with `files-read` (with that cwd) gives the model the
  image itself (an image part: `mediaType` `image/png`, base64 that
  round-trips to the downloaded bytes), not decoded bytes; `git status` in the
  talk worktree stays clean; ending the session deletes the file.
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
agent loop still skips the verify lane when no tool reported files and the
run's git working tree is unchanged (REQ-agent-085), so plain chat stays
fast. Fixture tests SHALL cover argv shape and summary parsing without a live
Discord token.

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

The live discord.js Client SHALL also be constructed with the same version
presence as its `presence` option, so the presence discord.js copies into the
gateway IDENTIFY payload at login carries the version Custom Status on the
first IDENTIFY and on every non-resumable re-identify (invalid or expired
session), where `ClientReady` does not fire again. The short-lived discord.js
Client that the DISCORD-8 requester check (`verifyRequesterCanSend`) logs in
with the same bot token SHALL carry the same version presence, so its IDENTIFY
never sends an empty activity list under the bot name. Every use SHALL build
the presence from one helper (`buildVersionPresenceData`) as a fresh object per
call.

Acceptance Criteria
- Presence activity state/name uses shared VERSION (e.g. `v0.0.3`), not a hardcoded bridge constant.
- Custom type (4) preferred with `state` holding the short version string.
- ClientReady / restart path sets presence; failure to set presence SHALL NOT abort slash registration or the bridge.
- Slash registration bodies and allowlists unchanged.
- Fixture test covers `buildVersionPresenceActivity` / format helper without a live token.
- The IDENTIFY presence discord.js builds at login (`options.ws.presence`, sent as `d.presence` on every IDENTIFY) has status `online` and exactly one activity: type 4, name `Custom Status`, state `v<version>`; it is never an empty activity list.
- ClientReady still calls `setPresence` with the same status and activity; a throwing `setPresence` is logged and the ready handler still records the bot user id and calls `onReady`.
- No new slash command, env var, config key or allowlist change.
- The DISCORD-8 requester-check Client (`verifyRequesterCanSend`) identifies with the same version presence (status `online`, one type 4 `Custom Status` activity), never an empty activity list.
- Regression tests in `tests/discord.presence.test.ts` run the real discord.js `login` with only the socket connect stubbed (no token, no network); the bridge and requester-check IDENTIFY tests fail on `main` and pass after.

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

`delete` removes the schedule and its whole run history, so it SHALL leave
SAFE-5 audit rows on the shared chain the way `/admin` does (REQ-discord-043):
a `started` row (action `schedule-delete`, surface `discord:schedule`, actor
the invoker's user id, args digest of the resolved schedule id — never the raw
id) before anything is deleted, then `ok` or `error`; the reply SHALL name the
row numbers. A non-ADMIN `delete` SHALL append `denied`. When the `started`
row cannot be recorded — the trail throws (including a keyed chain on a
process without `CORVIDINHO_AUDIT_HMAC_KEY`) or no trail is wired (a bridge
without a DB) — `delete` SHALL fail closed with the ephemeral
`Refused: audit log unavailable (SAFE-5)` reply and delete nothing; it SHALL
never make an unaudited delete. An unknown or missing schedule id deletes
nothing and appends no row.

Cadence SHALL enforce a minimum interval of **5 minutes** at create time.
Schedules SHALL persist in the shared Corvidinho SQLite database. The bridge
SHALL run a cooperative ~60s ticker that fires due active schedules
asynchronously with a small concurrency cap so live Discord HEAR and GitHub
WATCH ingress remain ≤ ~1 minute (DISCORD-SCHEDULE-4). Schedule ticks SHALL
re-check the live allowlist (and rely on existing SAFE gates) so a schedule
cannot post or act outside channels/repos already allowed (DISCORD-SCHEDULE-3):
before any worktree or agent run, and again right before the post, the
schedule's channel (when set) SHALL be allowlisted and the schedule's creator
SHALL pass the same actor gate as live ingress (`gateActor`, REQ-discord-201):
a deny-listed creator is refused (deny wins, the owner too); when the user or
role allowlist is non-empty the creator's user id SHALL be listed or be the
configured owner (a tick has no member roles, so a creator admitted only by a
listed role is refused); empty user and role lists leave the channel gate
alone. A run refused
before it starts SHALL create no worktree, spawn no agent and post nothing,
SHALL be recorded failed (`creator not allowlisted: …` or `channel not
allowlisted: <id>`) and SHALL count toward the 5-failure auto-pause; a run
whose creator or channel is refused by the time it would post SHALL NOT post.
No new env var, config key, slash command or option.
Provenance: steal archived corvid-agent schedule slash + scheduler + ADR
(DISCORD-SCHEDULE-5). No ProcessManager. Fixture tests without live Discord.

Acceptance Criteria
- `/schedule` registered with list/create/pause/resume/delete bodies.
- Admin can create with cadence + project + prompt; non-admin / empty admin denied.
- Cadence `<5m` refused; `>=5m` / `@hourly` accepted.
- list/pause/resume/delete behave; pause skips ticks; resume recomputes next_run.
- `/schedule delete` by the owner appends `started` then `ok` (action `schedule-delete`, surface `discord:schedule`, args digest only) before the schedule and its runs are gone; the reply names both row numbers and the chain verifies.
- When the audit trail throws, the chain is keyed and the process has no key, or no trail is wired, `/schedule delete` replies `audit log unavailable (SAFE-5)` and the schedule and its run history are kept.
- A non-ADMIN `/schedule delete` gets `not authorized` and appends `denied`; a delete that throws after the `started` row appends `error` and says so.
- Optional create `channel` must be allowlisted; tick re-checks before post.
- A due schedule whose creator is on `denyUsers` is refused at tick: no agent run, no post, the run is recorded failed with `creator not allowlisted: …`.
- With a non-empty user allowlist, a schedule by an unlisted creator is refused; one by a listed user or by the configured owner (not on the list) still runs and posts.
- A creator deny-listed while their run is in flight gets no post.
- Refused-creator ticks count toward the 5-failure auto-pause.
- With empty user and role lists a schedule by any creator still runs (channel-gated only).
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

A PEM private-key block SHALL be redacted even when its END line is missing
(text clipped mid-key, or a key pasted without its footer). From its
`-----BEGIN … PRIVATE KEY-----` header, the redaction SHALL run to the END
line, else to just before the next `-----BEGIN ` line, else to the end of the
text. Other PEM blocks (public keys, certificates) SHALL stay unchanged.

When the scrub rules tighten (`SCRUB_RULES_VERSION` increases), the next open
of the shared DB SHALL re-scrub existing rows once and record the version in
`schema_meta` (SAFE-6 re-scrub). Version 2 adds the open private-key block
rule. No CLI or slash surface is added. Outbound reply scrubbing beyond the
spawned-run summary text (REQ-agent-232) and a Discord-admin re-scrub command
are draft SAFE-10 and out of scope until captured.

Acceptance Criteria
- Each vendor shape is redacted; ordinary text is untouched; scrub is idempotent.
- Hostile input (many private-key or JWT openers with no closer) scrubs in linear time.
- A private-key block with no END line is redacted through the next BEGIN line or the end of the text; full blocks are still redacted one by one; public-key and certificate blocks are unchanged.
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
comment kept. The file SHALL be read and written as JSON exactly when the
allowlist loader reads it as JSON (one shared rule, `isJsonAllowlistPath`: a
case-sensitive `.json` suffix), else as TOML, so an edit always matches what
the next load reads. When that path is a symlink whose target does not
resolve (dangling or looping), the mutation, the atomic write and
`config show` SHALL refuse with a clear error, and the link SHALL NOT be
replaced by a regular file. The live allowlist SHALL be recomputed as file ∪
env and updated in place so it applies without a restart. Env values SHALL
NOT be written to the file or changed at runtime; the reply SHALL say so.

Empty SHALL stay deny-all: adding a deny-listed id SHALL be refused, and
removing an env-only channel SHALL be refused, as SHALL removing a channel
when no live channel that is not also on `deny_channels` would remain (deny
always wins, so only deny-listed channels left is the same lockout). When
the first user is added while users and roles were both empty, the reply
SHALL warn that unlisted callers now resolve to BLOCKED. Replies SHALL be
ephemeral, show before/after counts and never contain tokens or secrets.
`config show` SHALL list live/file/env counts, owner configured yes/no plus
display, and which knobs are updatable. Each mutation SHALL append SAFE-5
audit rows (`started` before the write, then `ok`/`error`); refusals SHALL
append `denied`. A mutation SHALL fail closed with the same
`audit log unavailable (SAFE-5)` refusal, writing nothing, both when the
trail throws and when no trail is wired (a bridge without a DB); it SHALL
never write an unaudited change. The gateway SHALL flatten subcommand-group
options.

Acceptance Criteria
- Non-owner and no-owner callers get ephemeral `not authorized` at dispatch and at the handler; the file is not written.
- `/admin users add` writes only the users line, keeps `[owner]`/`[github]`/comments, updates the live list in place, and warns on the first user.
- `/admin channels add` makes a new channel pass the slash gate without restart; `remove` drops it; env-only and last-channel removals are refused, and so is a removal that would leave only deny-listed channels.
- Deny-listed ids are refused; unreadable/unparsable files are refused untouched; JSON with lossy numeric ids is refused.
- `/admin config show` shows counts by source and updatable knobs, and no token, key or owner id.
- Mutations append `started` + `ok` audit rows with an args digest only; an unavailable audit trail refuses the change.
- With no audit trail wired (`recordAudit` unset), `users add` and `channels add` reply `audit log unavailable (SAFE-5)`, and the file and live lists are unchanged; `config show` still works.
- `allowlist.JSON` (TOML text) is edited as TOML, matching the loader, and reloads with the new entry; `allowlistFileFormat` agrees with `isJsonAllowlistPath` for every path.
- A dangling or looping symlink at the allowlist path is refused by `/admin`, `writeFileAtomic` and `config show`; the link stays a symlink and its target is not created.
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

### REQ-discord-098

The shared SQLite store SHALL treat the module-owned `spend_ledger` and
`spend_alerts` tables (created by `src/agent/spend.ts` and
`src/agent/spend-alerts.ts` with CREATE TABLE IF NOT EXISTS, no schema
version bump) like every other persisted table under SAFE-6: the free-text
`provider` and `model` columns of `spend_ledger` SHALL be written through
`scrubSecrets` and SHALL be listed in `SCRUB_TARGETS`, so a scrub-rules
re-scrub also covers them; `spend_alerts` SHALL hold no free text.

On Discord (SAFE-8 as amended on #98, AUTONOMOUS-8), a run that stopped at
the spend cap (`ask.reason` `spend-cap`) SHALL be posted through the
AUTONOMY-1/2 ask path on every bridge surface — chat reply, `/work`,
`/session start` and schedule post — with a paused, not failed, status and
without the "reply to answer" hint (a reply cannot lift the cap). Like a
stuck ask (AUTONOMY-2/4), a spend-cap ask SHALL ping the configured owner,
once per cap episode across those surfaces (the bridge's spend alert outbox
`claimCapPing`; a schedule also keeps its per-schedule ping key); later
spend-cap asks in the same episode SHALL post without a ping. A spend-cap
stop SHALL NOT be kept as the session's pending ask (AUTONOMY-5/6; a reply
cannot lift the cap): a later thin reply runs the agent like any other
message, a substantive reply carries no cap text into the prompt, and a
spend-cap pending ask persisted by an earlier build SHALL load as none;
clarify and stuck pending asks are unchanged. `/work` SHALL record a run
that stopped to ask as `blocked` (not `completed`; a stuck run stays
`failed`), SHALL say the PR was not opened because the run paused at the
spend cap, and `/status` SHALL count blocked work as waiting for input.
`/work` and `/session start` SHALL answer with the ask content in the one
message DISCORD-ASK-7 leaves (the thinking message edited into the answer
and the deferred reply deleted, else the status plus the reply), SHALL
address the requester on a clarify ask (AUTONOMY-4) and ping the owner only
for stuck and spend-cap asks; a run that stopped to ask SHALL never show "✅
Done" (the fallback status is the ask's). That owner ping and the warning
SHALL go out as a fresh channel post after the answer (allowed mentions
limited to the owner; an edit does not notify a mention), or be appended to
the answer that went out (the collapsed message edited again, or the reply)
when that post cannot be sent; when the answer itself fails (e.g. an
interaction token that expired during a long run) the notice SHALL still go
out as the fresh channel post and the answer's error SHALL still be raised.

The 80% warning SHALL reach the owner even when the run that crossed it had
no Discord reply (WATCH, the headless daemon, a delegate worker, a schedule
whose channel left the allowlist): every bridge post SHALL take the pending
warning from the outbox over the bridge's shared DB (the run's own
`spendWarning`, validated by `spendWarningFromUnknown`, only when the bridge
has no DB) and append the warning line built from integer amounts, pinging
the configured owner; a post that did not go out (a chat reply, a schedule
post, or a slash run's owner notice that went out neither as a channel post
nor in the reply) SHALL hand back both the warning and the cap episode's
owner ping for the next post, and a schedule SHALL keep no ping key for a
ping that was never posted. `/status` SHALL show the rolling 24-hour spend
against the cap with the percent, or that no cap is set, from the bridge's
shared DB, with no new slash command.

Acceptance Criteria
- A ledger row written with a vendor-key-looking provider or model persists redacted.
- `SCRUB_TARGETS` contains `spend_ledger` with `provider` and `model`.
- `rescrubDatabase` re-scrubs a raw `spend_ledger` row.
- A `spend-cap` ask reply carries the spend-cap headline and the question, pings the owner, its thinking status is not an error, and it never carries the reply hint.
- Two spend-cap asks with different amounts share one `askPingKey`.
- Two chat messages at the cap: the first reply pings the owner, the second posts the ask with no mention; after spend is seen under 70% the next one pings again. A spend-cap stop leaves no pending ask: a later `ok` runs the agent (still at the cap: the ask again, no mention) and a substantive reply's prompt carries no prior-question or cap text; a stored spend-cap pending ask loads as none while a stored clarify ask loads unchanged.
- `/work` with a clarify ask is `blocked`, mentions the requester in the reply and posts no owner notice.
- `/work` at the cap: the task is `blocked`, the reply shows the ask and the spend-cap PR line (no ✅), and one fresh post pings the owner; a second `/work` in the same episode does not ping. `/session start` at the cap shows the ask and pings the owner.
- A schedule spend-cap ask in an episode already pinged elsewhere posts without a mention.
- A warning recorded by another process (a WATCH-style run on the same data dir) appears on the next bridge chat reply with the owner pinged, once; `/work` delivers a pending warning as a fresh post pinging the owner.
- A result with `spendWarning` and no bridge DB gets the warning line and the owner in `mentionUserIds` (chat reply and schedule post); a malformed `spendWarning` in the result frame is dropped.
- `/status` with a $5 cap and $4.10 spent shows `Spend (24h): $4.10 of $5.00 daily cap (82%)`.
- `/work` whose final reply throws (expired interaction token) still posts the owner notice with the spend-cap ping and the pending warning, and the error is raised; `/session start` whose reply and notice both fail leaves the warning and the cap ping for the next chat reply, which pings the owner and carries the warning.
- A chat spend-cap reply that failed to post leaves the episode's owner ping for the next reply.
- A schedule spend-cap post that failed sets no ping key, and the next tick's post pings the owner.
- `/work` at the cap with an editable thinking message: the thinking message becomes the answer (`(blocked)`, the spend-cap ask, no ✅, no mention), the deferred reply is deleted, and one fresh post pings the owner with the pending warning; a second `/work` in the episode posts no owner notice.
- `/session start` with a stuck ask collapses to the ask (no ✅) and the owner gets a fresh post; with a clarify ask the collapsed answer mentions only the requester and no owner post goes out.
- The fresh owner post fails: the notice is appended to the collapsed answer (same message edited again, owner in its allowed mentions).
- Collapse, reply and owner post all fail (reply throws): the error is raised and the next chat answer carries the owner ping and the warning.

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
argv MUST NOT include `--no-verify`. An empty real diff with no
tool-reported files continues to skip verify inside the agent loop (honest
`verifySkipped`); when tools report file changes or the run's git working
tree changed (REQ-agent-085), `fledge lanes run verify` runs before done. Draft AGENT-14/15 are out
of scope. Package version SHALL bump to **0.0.13**. Fixture tests without live
Discord.

Acceptance Criteria
- Discord spawn argv never includes `--no-verify`.
- Package `0.0.13`; docs/STATUS/CHANGELOG updated.
- A run that changed the git working tree without a tool reporting it is verified before done; a run with an empty real diff and no tool-reported files still skips verify (REQ-agent-085).
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
  consecutive_failures (counted in SQL) / updated_at, and on the run row its
  outcome and ask (`ask_reason` / `ask_question`, REQ-discord-347); taking
  or handing back a run's ask writes only `ask_posted_at`, with a
  compare-and-set so one ticker takes it. A run finishing in one
  process SHALL NOT undo a pause or resume made in another.
- The scheduler SHALL record each run's outcome exactly once, even when a
  shutdown abandons a run that later returns.
- A run abandoned at shutdown SHALL also be stopped: `abandonInFlight` aborts
  the run's signal, and the spawn client (`AgentRunChatOpts.signal`) kills
  the spawned agent's whole process tree (AGENT-3 / REQ-plugins-154),
  including a process the agent left in its group that still holds the
  output pipe after the agent exited. The spawn client SHALL start each
  agent in its own process group and stop its tree when the bridge or
  daemon process exits. `ScheduleStore` SHALL start
  runs only through `claimRun` (the unused unconditional `markRunStarted` is
  removed).

Existing tick behaviour is unchanged: the 60 s poll, max 2 concurrent runs,
no catch-up, auto-pause after 5 failures, and the non-blocking tick
(DISCORD-SCHEDULE-4). The claim itself needs no schema change; the ask
columns are schema v11 (REQ-discord-347).

Acceptance Criteria
- Two tickers on one DB file start a due run once; one run row, `execution_count` 1.
- A tick sees create/pause/resume/delete made through another store handle.
- A pause made while a run is in flight survives that run finishing.
- Failures from two handles with stale caches still count to 2.
- `abandonInFlight` records a stuck run as failed once; a late agent result does not record it again.
- `abandonInFlight` aborts the signal the stuck run's agent was given.
- An abort after the spawned agent exited, while its background child still holds the output pipe, kills that child and `runChat` returns.
- A run's ask is taken by one ticker only: two bridge-wired tickers on one DB post a pending ask once (REQ-discord-347).

### REQ-discord-044

Sessions SHALL persist `pendingAsk` (including askId / expiresAt / optional
options). While set, a thin-ack continue SHALL restate the ask (stub+Choose
when options; formatAskReply when free-text) and SHALL NOT spawn the agent.
An explicit cancel SHALL clear pending ask. For free-text pending (no
options), a substantive continue SHALL clear pending and run the agent with
prior-question context. For button pending (has options), ordinary chat SHALL
continue the conversation WITHOUT clearing pending; only button pick, cancel,
or expiry SHALL clear it. Clarify asks SHALL mention the requester; stuck
asks SHALL mention the configured owner.

A `/work` or `/session start` run that stopped with a clarify or stuck ask
SHALL store that ask as its session's free-text pending ask (the slash answer
shows it as free text, with no Choose buttons), and `/work` SHALL record the
task `blocked` (a stuck ask stays `failed`), never `completed`
(AUTONOMY-1). The slash answer message SHALL be bound to its session like a
chat reply (DISCORD-2), so a reply to it by the requester continues that
session and the rules above apply (AUTONOMY-5/6). A SAFE-8 spend-cap stop
SHALL NOT be stored as the pending ask.

Acceptance Criteria
- Clarify mentionUserIds is [requester] when provided; stuck is [owner].
- Thin ack restates; pendingAsk remains.
- Cancel clears pendingAsk.
- Free-text substantive continue clears pending and runs agent.
- Button pending survives unrelated chat turns until pick/cancel/expiry.
- `/work` with a clarify ask (even one with structured options): the task is `blocked`, the session's pending ask is the free-text clarify ask, and the collapsed answer message maps to that session.
- A thin reply (`ok`) to the `/work` answer restates the question (requester mention, reply hint) and does not run the agent; the pending ask remains.
- `cancel` in reply to the `/work` answer clears the pending ask with the short ack and does not run the agent.
- A substantive reply to the `/work` answer resumes the same session (`resume: true`) with the prior question and the human answer in the prompt, and clears the pending ask.
- `/work` or `/session start` stopped at the spend cap stores no pending ask; a later `ok` to the `/work` answer runs the agent with no prior-question or cap text.
- `/session start` with a clarify ask: the pending ask is stored; a thin reply restates, a substantive reply resumes with the question.
- `/session start` with a clarify ask that has structured options: the pending ask is free text (no options), so a substantive reply answers and clears it.
- `/work` with a stuck ask: the task is `failed`, the pending ask is stored; the owner is pinged once by the separate notice post (the answer itself pings nobody), and a thin reply restates the question with allowed mentions limited to the owner (never the requester).
- A reply to the `/work` answer by another user (`ok`, `cancel` or a substantive answer) neither runs the agent nor clears or restates the requester's pending ask (SESSION-MULTI-1).
- A finished `/work` run (`completed`) stores no pending ask and its answer still continues the session.
- Without an editable thinking message the pending ask is still stored, and an @mention `ok` from the requester restates it without running the agent.

### REQ-discord-045

When an ask has two or more options (from ask-human `options` or a numbered
list parsed from the question), the bridge SHALL post a short public Choose
stub with a button, and on requester press SHALL reply with an ephemeral
interaction listing the option buttons. Button prompts SHALL expire after
about 30 minutes; a late press SHALL get a short "that choice expired".
Free-text clarify SHALL be used only when options cannot be listed.

Acceptance Criteria
- Structured or numbered options → stub + components; ephemeral open shows choices.
- Pick resumes the requester session with the chosen label.
- Expired press returns ASK_CHOICE_EXPIRED and clears pending.
- Question without listable options keeps the free-text ask-ping path.

### REQ-discord-046

Concurrent users in one channel SHALL each have their own session keyed by
Discord user id (+ channel / thread). Reply-to-bot and thread continue SHALL
only resume when the message author owns that session. Other users talking
while one has an open button ask SHALL not share history or invalidate the
other's buttons. Memory inject SHALL remain scoped to the acting Discord user.
Inside a thread a plain message SHALL continue the author's own session in
that thread; another user starting a session in the same thread SHALL NOT
take it over (SESSION-MULTI-1/2).

Acceptance Criteria
- Two @mentions from different users yield two session ids.
- A non-owner reply to another user's bot message does not continue that session.
- Same user @mention reuses their active session in the channel.
- In one thread, after user A starts a session and user B then @mentions the bot there (B's own session), A's plain message continues A's session and B's continues B's; neither is ignored nor runs in the other's session.
- The same holds while A has an open button ask (the ask keeps its id and expiry; B's session has none), after B's session ends, and after a restart (sessions reloaded from SQLite).
- A plain message from a user with no session of their own in the thread is ignored; their @mention starts their own session.

### REQ-discord-203

Each `/schedule` run SHALL get its own git worktree directory and `talk/`
branch named from the full schedule id and run id, never a shortened prefix,
so one run never reuses or removes the worktree or branch of another run of
the same schedule, or of another schedule running at the same time
(SESSION-WORKTREE-1 / SESSION-WORKTREE-3 / DISCORD-SCHEDULE-3). When creating a
worktree finds a stale branch of the same name, it SHALL delete that branch
only when it has no commits off the project HEAD; a branch with its own
commits SHALL be renamed aside to `<branch>-parked-<ms>` and SHALL NOT be
force-deleted. Removing or parking a worktree with branch cleanup SHALL
likewise delete its branch only when the branch has no commits off the project
HEAD, whatever the default branch is called; any git error SHALL count as
having commits and keep the branch.

Acceptance Criteria
- Two runs of one schedule use different worktree dirs and branches; a parked run's commits survive the next run.
- Two schedules whose ids share a prefix, running at once, get different worktrees; neither run's setup removes the other's live working tree.
- A stale branch with commits off HEAD is kept under `<branch>-parked-<ms>`; a stale branch with no commits of its own is deleted as before.
- In a repo whose default branch is `trunk` (no `main`/`master`), removing or parking a worktree keeps a branch with a commit of its own and still deletes a branch with none.

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

### REQ-discord-201

Every inbound Discord @mention, reply-to-bot continuation, thread
continuation and slash command SHALL, after the channel gate, gate the actor
with `gateActor` (ALLOW-3 / ALLOW-5 / DISCORD-5). A user on `denyUsers` or
holding any role on `denyRoles` SHALL be refused (deny always wins). When
the user or role allowlist is non-empty, the actor SHALL pass only when the
user is listed, holds a listed role, or is the configured owner (IDENTITY-1/2);
when both lists are empty the channel gate alone applies (ROLES-CHAT-1).
Refusal on MessageCreate SHALL be silent: no public reply, no session
created, no agent run (DISCORD-DENY-1). Refusal on slash SHALL be the
ephemeral zero-width ack for every command, before mute/rate and any handler,
so nothing is spawned (DISCORD-DENY-3). Mute keeps its own reply (DISCORD-6).
No new env var, slash command, table or column.

Acceptance Criteria
- With `users = ["leif"]` and `deny_users = ["mallory"]`, mallory and an unlisted member get a silent refuse on @mention, reply-to-bot and thread continuation, and no session is created.
- `/work`, `/session start` and `/status` by mallory or an unlisted member return `user_not_allowlisted` with only an ephemeral zero-width ack; no agent run, work task or session is created.
- A listed user, a member with an allowed role, and the owner not on the user list still start sessions and run slash commands.
- With empty user and role lists any member of an allowlisted channel may chat, but a deny-listed user or role is still refused.

### REQ-discord-202

A project picked from Discord — the optional `project` of `/work` and
`/session start`, the `project` of `/schedule create`, and a stored
schedule's project at tick time — SHALL resolve only to the bridge project
root, a directory inside it, or a sibling checkout (a direct child of the
root's parent directory) that is the top of its own git checkout and whose
`origin` OWNER/REPO passes the GitHub repo allowlist (deny wins; empty allow
or no allowlist ⇒ refuse) (ALLOW-2 / ALLOW-6 / SAFE-3 / DISCORD-SCHEDULE-3).
Containment SHALL be checked on real paths so absolute paths, `..`
traversal and symlinks cannot leave that set, and a path lexically outside it
SHALL be refused before any disk probe. A refused project SHALL get a short
`not authorized` reply and SHALL create no session, worktree, `talk/*`
branch, schedule or agent run. No new env var, config key, slash command or
option.

Acceptance Criteria
- `/work` or `/session start` with an absolute path or `../` traversal to another repo on the host is refused; no agent run, session, worktree or talk branch.
- A symlink inside the bridge root that points outside it is refused.
- A sibling checkout runs only when its origin passes the GitHub repo allowlist; a denied, unlisted or non-git sibling is refused.
- `/schedule create` refuses such a project and stores nothing; a stored schedule with such a project fails its tick without running the agent.
- Empty project, the bridge root and directories inside it behave as before.

### REQ-discord-241

The default worktree id and `talk/` branch name that `ensureTalkWorkspace`
derives from a session or run id (`talkWorktreeId` /
`generateTalkBranchName`) SHALL be deterministic for that id and SHALL
include a collision-resistant digest of the full id, not only a shortened
prefix, so two ids that share a prefix never get the same worktree dir,
scoped dir or branch, and creating one talk's workspace never removes another
talk's live working tree (SESSION-WORKTREE-1 / SESSION-WORKTREE-3 /
DISCORD-SCHEDULE-1). Explicit `worktreeId` / `branchName` overrides and
names already stored on a session SHALL be used as given. No new env var,
slash command or schema change.

Acceptance Criteria
- Two ids that share their first 16 characters (e.g. `schedule_sched_a1111111_run_aaaa` and `schedule_sched_a2222222_run_bbbb`) get different default worktree ids and branch names; the same id always gets the same names.
- `ensureTalkWorkspace` with default naming for two such ids creates two different worktrees and branches; the first's uncommitted files survive the second's setup.
- In a non-git project the two ids get different scoped dirs and the first's files survive.
- A talk stored before the digest change with a prefix-only worktree path and `talk/` branch keeps that path and branch when it re-binds after a restart, and a new talk whose id shares that prefix gets a different worktree and branch and leaves the stored talk's worktree, branch and uncommitted files in place.

### REQ-discord-331

A schedule tick that throws SHALL NOT take down the process that runs it
(DISCORD-SCHEDULE-4 / CLI-8 / AUTONOMOUS-4). The store calls a tick makes
(`refresh`, `listDue`, `claimRun`) can throw, for example `SQLITE_BUSY` after
the 5 s busy timeout while the bridge, `corvidinho daemon`, watch and agents
share one data dir. Bun exits the process on an unhandled rejection.

- The scheduler's own interval (`SchedulerService.start()`, which the Discord
  bridge uses) SHALL catch a rejected tick and log one stderr line,
  `[scheduler] tick failed: <message>`. The message SHALL be passed through
  `scrubSecrets` (SAFE-6) and capped. No stack is logged.
- `tick()` SHALL still reject for direct callers, so the daemon keeps its own
  `tick.failed` JSON log line. A tick that throws SHALL release its tick lock,
  so the next tick runs. Runs it claimed before the throw SHALL keep running.
- The fire-and-forget run promise that a tick starts SHALL never reject. An
  error that escapes a run (for example, recording its failure also throws)
  SHALL be logged the same way as `[scheduler] run failed: <message>`.
- A run SHALL always free its running slot when it ends, even when parking its
  worktree throws, so that schedule can run again and the concurrency cap is
  not used up.
- No global `unhandledRejection` handler SHALL be installed.

Existing tick behaviour is unchanged: the 60 s poll, max 2 concurrent runs,
no catch-up, auto-pause after 5 failures, the atomic claim (REQ-discord-108)
and the non-blocking tick. No new env var, slash command, CLI flag, table or
column.

Acceptance Criteria
- With the interval running, `listDue` or `claimRun` throwing once gives no unhandled rejection, one scrubbed `[scheduler] tick failed:` line with no raw token, and the next tick starts the due run.
- A separate Bun process that runs the scheduler interval, with a store that throws once, stays up and exits 0. Before the fix it exited 1.
- A manual `tick()` whose `claimRun` throws on the second due schedule rejects. The first run keeps going, and the next `tick()` starts the second.
- A run whose agent throws and whose `markRunFinished` also throws logs `[scheduler] run failed:` and frees its slot, with no unhandled rejection.
- A run whose `parkWorktree` throws frees its slot, and the same schedule starts again on a later tick.

### REQ-discord-253

The GITHUB-6 repo gate the `/work` draft-PR step (REQ-discord-088) applies to
the push remote's OWNER/REPO SHALL, by default, use the allowlist file plus
env overlays (ALLOW-4, `checkRepoGateAsync`), not env overlays alone, so a
`deny_repos` / `deny_orgs` entry in the file refuses the PR step even when
the allow list comes from env, and an allow list only in the file admits the
repo. A refusal SHALL be reported as `repo-denied` before any commit, push,
verify or PR call. No new env var, config key, slash command or option.

Acceptance Criteria
- File deny + env allow: the `/work` PR step says `not opened` with the GITHUB-6 denial, calls no plugin and pushes nothing.
- File-only allow: the `/work` PR step opens the draft PR (dry run in tests).

### REQ-discord-357

Parking a Discord session's worktree SHALL persist `worktree_state = parked`
on its session row before any removal side effect, and the final state once
the removal is done, without re-inserting a row that was already deleted. A
crash between the park and the row delete SHALL NOT leave a row that restarts
as `active` at a removed directory (SESSION-WORKTREE-3). A park cut short
(row `parked` with its path still recorded) SHALL be finished when the talk
ends. Binding a session SHALL reuse a recorded `active` worktree only when its
directory exists; otherwise it SHALL re-create the worktree for the same
session and project through the existing worktree manager, never falling back
to the repo root or another talk's directory, and a different project SHALL
still be refused (SESSION-WORKTREE-4). The bridge SHALL bind on every turn
(a chat continue and a button-ask pick alike) so a turn after a restart never
spawns in a missing directory, a parked worktree, or the repo root.

Acceptance Criteria
- The row reads `parked` as soon as a park starts, before the worktree is removed.
- After a restart, a talk whose park finished or was cut short is not `active`; its next turn runs in an existing worktree that is not the repo root.
- A `parked` row whose directory is still there is removed when the talk ends.
- An `active` row at a removed directory is re-bound to an existing worktree for the same project; a different project is refused.
- A button-ask pick after a restart on a `parked` row runs in an existing worktree that is not the repo root.
- No new env vars, slash commands, or schema changes.
### REQ-discord-047

When the bridge posts a button ask (Choose stub + components), it SHALL NOT leave a
separate thinking embed whose primary status is "Needs your input" (or stuck
equivalent) as the public UX. It SHALL prefer a single public Choose stub by
editing the thinking progress message into that stub (clearing the embed) when
`editMessage` is available (DISCORD-ASK-6).

Acceptance Criteria
- Button ask path: one tracked public message with Choose components; no parallel
  "Needs your input" Done embed when collapse succeeds.
- Fallback when editMessage unavailable: prior status embed + separate stub reply.

### REQ-discord-048

On successful completion after a button pick, on a normal successful mention
done, or on successful `/session start` / `/work` completion, the bridge SHALL
prefer editing the existing stub or thinking progress message into the final
answer content instead of posting an extra "✅ Done" thinking status plus a new
reply, when `editMessage` is available (DISCORD-ASK-7). For slash, when collapse
succeeds the deferred interaction reply SHALL be deleted (or thin-resolved).
Ephemeral Choose → options remains unchanged (DISCORD-ASK-1..5).

Acceptance Criteria
- Mention success: progress message becomes the answer body when collapse succeeds.
- Button pick success: stub (reused as thinking) becomes the answer when collapse succeeds.
- Slash `/session start` / `/work` success: thinking becomes the answer body and the deferred reply is deleted (or thin) when collapse succeeds.
- Fallback preserves Done embed + separate reply when editMessage is unavailable.

### REQ-discord-049

After the requester presses an ephemeral choice button, the bridge SHALL clear
or disable those option buttons immediately, SHALL keep `pendingAsk` cleared so
a re-press is expired or otherwise a no-op (not a second agent resume), and
SHALL delete or thin-update the ephemeral "Got it — Working on it…" message once
the resume finishes (or immediately after pick) so it does not linger as a
dismissible half-done UI (DISCORD-ASK-8).

Acceptance Criteria
- Pick update includes empty components (buttons gone) and clears pendingAsk before resume.
- Re-press after clear does not spawn a second resume.
- Ephemeral ack is deleted (or thin-updated without buttons) after resume completes when deleteReply is available.

### REQ-discord-457

When the bridge edits the thinking progress message into the final answer
(DISCORD-ASK-7: an @mention or reply, the answer to a run a button pick
resumed, `/session start`, `/work`), the edit SHALL keep one footer-only embed
(no description) whose footer text is the LLM model and the run's plumbing
(`state=… verified=… [verifySkipped] [cancelled] attempts=…`) joined by
` | `, so both stay visible without entering the answer body (DISCORD-3.a).
The embed SHALL be colored like the done or error status the fallback would
show. A Choose stub (the edit that carries buttons) SHALL carry no embed
(DISCORD-ASK-6, REQ-discord-047). The answer body SHALL remain human text only.

Acceptance Criteria
- Mention answer collapsed into the thinking message: `content` is the summary and `embed` is `{ color, footer: { text: "<model> | state=… verified=… [verifySkipped] attempts=…" } }` with no description; no `✅ Done` embed edit.
- Button pick: the Choose stub edit has `embed: null`; the answer of the run the pick resumed, edited into that stub, carries the footer-only embed.
- `/session start` and `/work` collapsed answers carry the same footer-only embed; the body never contains `state=` or `attempts=`.
- Color: success unless the fallback would mark the status failed (a failed run without a question, or a stuck ask), then error.
- A later re-edit of the collapsed answer (SAFE-8 owner notice appended) keeps the same footer and color.
- With neither a model nor plumbing known the answer carries no embed; the fallback without `editMessage` is unchanged (done/error embed with the plumbing + separate reply).
- No new env vars, config keys, slash commands or schema changes.

### REQ-discord-311

While the bridge works on a reply to a Discord message, or on the run a
button pick (DISCORD-ASK) resumes, it SHALL keep one
`discord_inflight_replies` row (schema v9: id, session id, channel id, the
allowlisted parent channel id when the reply is in a thread, progress embed id
once sent, request message id, start time; no message text) from before the
progress embed is sent until the reply finishes, and SHALL delete it on every
exit path (done, failed exit, ask, worktree refused, thrown error). On start,
the bridge SHALL read the rows left by an earlier process before any new reply
begins and, once the gateway is up, handle each one sequentially and best
effort: when neither the row's channel nor its parent channel is allowlisted
any more (DISCORD-5), post and edit nothing; otherwise edit the bot's own
progress embed to the red failed status `interrupted: Corvidinho restarted
before this reply finished — please send it again`, and when there is no embed
id or the edit fails, reply to the recorded request message in the same
channel with the same text; then delete the row. Recovery SHALL NOT throw out
of bridge start and SHALL NOT touch any other channel or message. No slash
command or env var is added.

Acceptance Criteria
- A running reply has exactly one row whose progress id is the sent embed; the row is gone after success, failed exit, ask, thrown error and worktree refusal; ignored or refused messages never add one.
- A reply in a thread records the thread as its channel and the allowlisted parent channel; a button pick's resumed run records a row (request id = the ask stub message) and clears it after.
- A bridge that died mid-reply leaves the row; the next start edits that embed (same channel, same message id) to the error color with the interrupted text, sends no new message, and deletes the row.
- A failed edit, or a row with no embed id, falls back to a reply to the request message with the interrupted text; the row is deleted.
- A row whose channel and parent channel are no longer allowlisted gets no edit and no reply; the row is deleted.
- Edit and reply both failing still lets the bridge start; the row is deleted.
- With no rows, bridge start sends, edits and replies nothing.
- A fresh DB is schema 9 with the table; a v8 DB migrates to 9 and keeps its rows.

### REQ-discord-212

The bridge SHALL process a MessageCreate only when the message's own channel
is allowlisted (DISCORD-5): the thread's parent channel (the DISCORD-2.a
resolution) or the thread itself. This gate SHALL run before the thread,
reply-to-bot and mention paths, and the channel recorded on a session SHALL
NOT stand in for it, so a message that references a tracked bot message
from an allowlisted channel never continues that session, spawns the agent,
or posts or edits anything in a channel that is not allowlisted. Refusal
SHALL be silent (DISCORD-DENY-1): no public reply, no DM, no reaction.

The gateway SHALL set `InboundMessage.referencedMessageId` only for a reply
in the message's own channel: a reference of type
`MessageReferenceType.Forward` SHALL be dropped, and so SHALL a reference
whose channel is neither the message's channel nor, inside a thread, the
thread's parent channel. A reply in the same allowlisted channel SHALL still
continue its session (DISCORD-2), and a thread under an allowlisted parent
SHALL still continue its session (DISCORD-2.a).

An ask button press (DISCORD-ASK) SHALL resume a session only when the press
channel is allowlisted, or is the session's thread under an allowlisted
parent (DISCORD-2.a), and the session's own channel, where the resumed run
posts, is still allowlisted. Otherwise the bridge SHALL answer with an
ephemeral ack only — the allowlist tip for an admin, the zero-width ack for
anyone else (DISCORD-DENY-2/3) — and SHALL NOT resume the session, run the
agent, or send or edit anything. No slash command, env var, table or column
is added.

Acceptance Criteria
- The owner forwards a tracked bot message from an allowlisted channel into a non-allowlisted channel (with or without an @mention): `routeMessage` returns a silent `ignore` / `refuse` with no reply, the agent is not spawned, and nothing is sent, edited or deleted in that channel.
- A thread message under a non-allowlisted parent does not continue a session whose recorded channel is allowlisted.
- `replyReferenceMessageId` returns undefined for a forward-type reference and for a reference to another channel; it returns the message id for a same-channel reply (default or missing type) and, inside a thread, for a reference to the thread or its parent.
- A reply to a tracked bot message in the same allowlisted channel still continues the same session; a thread under an allowlisted parent still continues its session.
- An ask button pressed in a non-allowlisted channel, or after the session's channel left the allowlist, gets only the ephemeral zero-width ack (the allowlist tip for an admin): the ask stays pending, the agent is not run, and nothing is sent or edited; a press in the allowlisted channel, or in the session's thread under an allowlisted parent, still resumes (DISCORD-ASK-3).

### REQ-discord-215

Discord does not notify a mention added by a message edit. Whenever the
bridge delivers an answer by editing the thinking (or Choose stub) message
(DISCORD-ASK-6/7: the chat answer, the answer to a run a button pick resumed,
`/work` and `/session start`) and that answer mentions the requester (a
clarify ask, AUTONOMY-4) and/or the configured owner (a stuck ask,
AUTONOMY-2; a spend-cap ask or the 80% warning, SAFE-8), the bridge SHALL
additionally send one short fresh post to the same channel, replying to the
edited answer, whose content is only those mentions with a one-line pointer
(`↑ question for you` for the requester the clarify ask addresses, `↑ needs
you` for everyone else) and whose allowed mentions are exactly those users
(no `@everyone`, `@here` or roles). The bridge SHALL NOT ping a user twice in
one turn: a user a fresh post already pinged (the slash owner notice of
REQ-discord-098) is left out, and the spend cap's once-per-episode owner ping
(`claimCapPing`) still applies, so a spend-cap ask whose episode already
pinged adds no owner ping. When the answer went out as a fresh reply (the
fallback when the edit is unavailable or fails) or mentions nobody, no extra
post SHALL be sent. A chat or button-pick ping post SHALL be tracked like the
answer, so replying to it continues the session (DISCORD-2). The ping is best
effort: a failed or throwing post SHALL NOT fail the turn or undo the
answer. The one-message layout of DISCORD-ASK-6/7 is otherwise unchanged; no
slash command, env var or schema change.

Acceptance Criteria
- A chat clarify ask collapsed into the thinking message (free text or Choose stub) is followed by exactly one fresh post, `<@requester> ↑ question for you`, replying to the edited answer, with allowed mentions exactly the requester; a reply to that post continues the session.
- A chat stuck ask collapsed into the thinking message is followed by exactly one fresh post, `<@owner> ↑ needs you`, with allowed mentions exactly the owner (the requester is not pinged).
- A collapsed clarify ask carrying a pending 80% warning is followed by one post pinging the requester (question) and the owner (needs you), allowed mentions exactly those two.
- Two chat spend-cap stops in one cap episode produce one owner ping post in total.
- A collapsed answer that mentions nobody, an answer delivered as a fallback reply, and a failed ping post add no post; the turn still finishes.
- A button pick whose resumed run gets stuck collapses the stub into the ask and is followed by one owner ping replying to the stub.
- `/work` with a clarify ask collapses the answer, deletes the deferred reply and is followed by one requester ping, with no owner notice.
- `/work` at the spend cap with a pending warning sends exactly one owner post (the REQ-discord-098 notice) and no duplicate ping; `/session start` with a clarify ask by the owner and a pending warning sends only the owner notice.
- When the slash owner notice post fails and is appended to the collapsed answer, one owner ping post follows.
- A slash answer delivered through the deferred reply (no collapse) adds no ping post.

### REQ-discord-287

`rescrubDatabase` (the SAFE-6 re-scrub run by `ensureScrubbed` on DB open when
`SCRUB_RULES_VERSION` increases, REQ-discord-066) SHALL take the shared DB
write lock before it reads rows (BEGIN IMMEDIATE), so a concurrent writer or
opener in another process is waited for under the DB busy_timeout instead of
failing at once with "database is locked". No new env var, config key,
pragma, CLI or slash surface.

Acceptance Criteria
- While another process holds the write lock and then commits, `rescrubDatabase` waits, re-scrubs the pending rows and returns their count.

### REQ-discord-312

Inbound Discord chat content that mentions a user as `<@id>` or `<@!id>` SHALL be rewritten to `Discord user id <id>` before the agent prompt so the snowflake remains available for `discord-user-lookup` (IDENTITY-5). Mentions SHALL NOT be stripped to empty. Package version SHALL be `0.0.28` with CHANGELOG and docs covering lookup, soft-land, and chat tool discipline (DISCORD-13 / ROLES-CHAT-9). Discord channel replies from tool-round exhaustion SHALL never show the raw internal stop reason (AGENT-9 / REQ-agent-312).

Acceptance Criteria
- `stripMentions("hey <@3040…>")` contains `Discord user id 3040…`.
- Package `0.0.27`; CHANGELOG + `docs/discord.md` document lookup and soft-land.
- Fixture coverage via soft-land + user-lookup tests.

### REQ-discord-313

When inbound content is rewritten for IDENTITY-5 mention preservation, the chat body used for AUTONOMY-5/6 thin-ack and cancel detection SHALL ignore the mention trailer / `Discord user id` annotations so that messages like `<@bot> ok` still thin-ack a pending ask without spawning the agent. The full prompt (including the trailer) SHALL still be passed to the agent on substantive continues.

Acceptance Criteria
- `stripMentions("<@999> ok")` body line is `ok` and includes a mentioned trailer with the snowflake.
- Bridge pending-ask path: `@mention ok` restates without a second agent run (`tests/discord.slash-pending-ask.test.ts`).

### REQ-discord-418

Slash list surfaces SHALL NOT show one user's sessions to another, and SHALL
NOT show an absolute host path to anyone but ADMIN (SESSION-MULTI-1,
ROLES-CHAT-1..4, IDENTITY-2/3). ADMIN is resolved at handler time with
`resolvePermissionLevel` (the configured owner; empty owner means nobody).

- `/session list` by ADMIN SHALL list every active session as before,
  including each session's full project path.
- `/session list` by anyone else SHALL list only sessions whose owner user id
  equals the acting user id. Another user's session id, mention and topic
  SHALL NOT appear. The project SHALL be shown as its name (the last segment
  of an absolute path; a relative name as given), never as an absolute host
  path. A member with no own sessions SHALL get "No active sessions.".
- `/schedule list` by anyone but ADMIN SHALL show each schedule's project as
  its name, never an absolute host path; ADMIN sees the stored project.
- `/status` SHALL stay counts-only (no session ids, mentions, topics or
  paths).

No new slash command, option, env var, table or column. The session store and
its `list()` are unchanged.

Acceptance Criteria
- A member's `/session list` shows only their own sessions and none of another user's id, mention or topic.
- A member's `/session list` never contains an absolute host path; the project name is shown instead.
- A member with no own sessions gets "No active sessions." even when other users have sessions.
- The owner's `/session list` shows every user's sessions with full project paths.
- With no owner configured, nobody is ADMIN and every user sees only their own sessions.
- A member's `/status` has counts only, with no session id, mention, topic or project path.
- A member's `/schedule list` shows the project name, not the absolute path; the owner's shows the full path.
- Regression tests in `tests/discord.session-list-scope.test.ts` fail on `main` and pass after the fix.

### REQ-discord-346

A schedule run SHALL NOT stay `running` forever, and SHALL NOT leave its
worktree behind, when the process running it stops, crashes or cannot write
its outcome (DISCORD-SCHEDULE-2 / DISCORD-SCHEDULE-4 / SESSION-WORKTREE-3 /
CLI-8 / AUTONOMOUS-4).

- Outcome write. `SchedulerService` SHALL treat a run as recorded only after
  `markRunFinished` succeeds. A write that throws (for example
  `SQLITE_BUSY` past the 5 s busy timeout) SHALL be logged to stderr
  (scrubbed, one line) and retried once. If the retry also throws, the
  scheduler SHALL log `[scheduler] run failed: could not record run <run> of
  schedule <schedule> …`, count the run as failed (`onRunFinished` with
  `ok: false` and a "run outcome not recorded" error, and the in-memory
  failure count) and leave the row to start-up recovery. An error that reaches
  a run's catch after its outcome was already recorded SHALL be logged as
  `[scheduler] run failed: <message>`, never swallowed. `markRunFinished`
  SHALL write the schedule's failure counter and the run row in one
  IMMEDIATE transaction, so a retried write never counts a failure twice.
- Bridge stop. The Discord bridge's `stop()` SHALL, like the daemon, record
  every schedule run still in flight as failed (`interrupted: bridge
  shutdown`) through `abandonInFlight`, which aborts the run's agent process
  tree (REQ-discord-108). Nothing is posted for an abandoned run.
- Bounded settle. After `abandonInFlight`, the bridge and the daemon SHALL
  wait up to 3 s (`settleAbandoned(ABANDONED_SETTLE_MS)`) for the aborted
  runs to park their worktree and delete their empty `talk/schedule_*`
  branch before the stop resolves.
- Runner. Each claimed run SHALL record the process running it in
  `schedule_runs.runner` as `<pid>:<Linux /proc start time>` (schema v10),
  so a recycled pid never passes for a process that died.
- Start-up recovery. Before its first tick, the bridge (when its scheduler is
  enabled) and `corvidinho daemon` SHALL run `recoverAbandoned()`:
  - every `running` row whose runner is gone, or not recorded (rows from
    before v10), SHALL be marked `failed` with error `interrupted: process
    restarted` and a completion time;
  - every schedule-run worktree (`talk-schedule_<schedule>_<run>` checked out
    on `talk/schedule_<schedule>_<run>`) registered in the default project
    root or a schedule's project whose run this data dir recorded, under that
    schedule, as no longer `running` SHALL be parked with the existing safe
    cleanup: the branch is deleted only when it has no commits off the project
    HEAD (`branchHasOwnCommits`), otherwise kept;
  - a run whose runner process is alive (another bridge or daemon on the same
    data dir) and its worktree SHALL be left alone;
  - a schedule-run worktree whose run this data dir does not know SHALL NOT
    be touched: it belongs to another data dir sharing the repo (another
    bridge or daemon, or `bun test` / the verify lane run inside a live
    schedule worktree), and worktrees with other names SHALL NOT be touched
    either.
  Recovery changes only the run row, not the schedule's counters, and never
  throws (errors are logged). The bridge logs one `[discord] restart
  recovery:` line when it fixed something.

Existing behaviour is unchanged: the 60 s poll, max 2 concurrent runs, no
catch-up, auto-pause after 5 failures, the atomic claim (REQ-discord-108) and
the non-blocking tick (REQ-discord-331). No new env var, slash command or CLI
flag.

Acceptance Criteria
- `markRunFinished` throwing once: the run row is `completed`, `onRunFinished` fires once with `ok: true`, and a "retrying once" line is logged.
- `markRunFinished` throwing twice: `[scheduler] run failed: could not record run …` is logged, `onRunFinished` fires once with `ok: false` and "not recorded", the in-memory failure count is 1, the slot is freed and nothing rejects.
- Bridge `stop()` with a schedule run in flight (real spawn client, fake `sh` agent) records it `failed` with `interrupted: bridge shutdown`, the agent is gone, and its worktree and empty branch are removed.
- Bridge start after a `kill -9` of a process that was running a schedule run marks that run `failed` (`interrupted: process restarted`) and removes its worktree; a run another live process owns stays `running` with its worktree and branch.
- A claimed run records `<pid>:<proc start>`; a v9 DB migrates to v10 keeping its rows, and a `running` row without a runner is recovered.
- A daemon or bridge start never touches a schedule-run worktree whose run its data dir does not know (another data dir's run), even when started with that worktree as its project root: the worktree, its uncommitted files and its branch stay.
- Each case above except the last guard fails on the code before this change; the guard fails on the first version of this change.
### REQ-discord-417

Errors shown to an operator SHALL be one SAFE-6 line, and a rejected Discord
login SHALL end the bridge start cleanly (CLI-4, SAFE-6).

- `formatErrorLine(err, { env?, max? })` in `src/store/scrub.ts` SHALL return
  the error message only (a `TypeError` / `RangeError` / `ReferenceError` /
  `SyntaxError` keeps its class name; other names are dropped), with the
  literal value of each set secret env var from `.env.example`
  (`DISCORD_TOKEN`, `DISCORD_BOT_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`,
  `CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY`, `CORVIDINHO_AUDIT_HMAC_KEY`;
  values of 8+ characters) replaced by `[redacted:env-secret]`, then passed
  through `scrubSecrets`, cut to its first line and capped at
  `ERROR_LINE_MAX` (300) characters. It SHALL NOT throw; an unprintable value
  gives `(unprintable error)`.
- `startBridge` SHALL catch a rejected `gateway.start()`, stop the
  half-started gateway (the schedule ticker is not started yet) and return
  `{ ok: false, exitCode: 1, message }` with
  `message = formatDiscordLoginFailure(err, { env })` (the bridge's env, so a
  token passed only in `startBridge({ env })` is redacted too): discord.js
  `TokenInvalid`
  counts as 401; on 401/403 it is
  `discord login failed (<status>): check DISCORD_TOKEN (<line>)`; otherwise
  `discord login failed: <line> — check DISCORD_TOKEN and that discord.com is
  reachable`.
- `formatRegisterCommandsFailure(err, { what?, guildHint?, env? })` in
  `src/discord/register-commands.ts` SHALL return one line
  `[discord] <what> (<status>): <line>` (`what` defaults to
  `register-commands failed`; no status part when the error has none), adding
  `— check DISCORD_TOKEN / DISCORD_BOT_TOKEN and <guildHint>` (default
  `--guild-id`) on 401/403. The bridge's slash registration on gateway ready
  SHALL log it with `what: "slash command registration failed"` and
  `guildHint: "DISCORD_GUILD_ID"`, never the DiscordAPIError object (stack,
  `rawError`, `requestBody`).

Existing start refusals (missing token, empty channel allowlist) are
unchanged. No new env var, slash command, CLI flag, table or column.

Acceptance Criteria
- `startBridge` whose gateway `start()` throws discord.js `TokenInvalid` returns `{ ok: false, exitCode: 1 }` with `discord login failed (401): check DISCORD_TOKEN (An invalid token was provided.)` and calls the gateway's `stop()` once.
- A `DiscordAPIError` with status 403 gives `discord login failed (403): check DISCORD_TOKEN …` on one line with no `rawError`.
- `corvidinho discord bridge` with a token Discord rejects exits 1 with that line and no stack, crash footer or token value.
- `formatErrorLine` returns only the first line, redacts vendor-key shapes (including a multi-line private-key block) and the value of a set secret env var of 8+ characters, keeps shorter values, keeps the `TypeError:` prefix, drops `DiscordAPIError[0]`, handles strings, `{message}` objects, numbers, empty messages and null-prototype objects, and caps at `ERROR_LINE_MAX`.
- A token that is only in the `startBridge` env and appears in the login error text is redacted in the returned message.
- `formatRegisterCommandsFailure` on a `DiscordAPIError` 403 `Missing Access` with the bridge options gives `[discord] slash command registration failed (403): Missing Access — check DISCORD_TOKEN / DISCORD_BOT_TOKEN and DISCORD_GUILD_ID` with no `requestBody` and no newline; with defaults a 401 names `--guild-id`, a status-less error gets no hint, and a secret env value is redacted.

### REQ-discord-347

A schedule run that stops to ask a human SHALL reach Discord even when the
ticker that claimed it has no Discord connection (AUTONOMY-2, AUTONOMOUS-7;
`corvidinho daemon`, CLI-8 / AUTONOMOUS-4). The daemon SHALL still need no
Discord token (REQ-cli-108): it records the ask, and the bridge posts it.

- Record. When a schedule run ends with an ask (`stuck`, `clarify` or
  `spend-cap`), the run-finish write SHALL store the ask on the run's
  `schedule_runs` row: `ask_reason`, and `ask_question` written through
  `scrubSecrets` (SAFE-6) and capped at `ASK_QUESTION_MAX`, with
  `ask_posted_at` unset (schema v11). `ask_question` SHALL be listed in
  `SCRUB_TARGETS`. A run without an ask stores none.
- In-process post. A ticker that can post (the bridge) SHALL take the ask it
  is about to post with a compare-and-set on `ask_posted_at IS NULL` before
  posting it, as today, so no other ticker posts it too. A run whose creator
  or channel the live DISCORD-SCHEDULE-3 gate (REQ-discord-020) refuses posts
  nothing and its ask stays pending.
- Delivery. On each scheduler tick a ticker that can post SHALL, without
  awaiting it (DISCORD-SCHEDULE-4), deliver pending asks: for each schedule
  whose newest finished run (by completion time) has an ask no ticker took,
  when the schedule has a channel and its creator and channel pass the same
  live DISCORD-SCHEDULE-3 gate as a run's post (REQ-discord-020: the creator
  through `gateActor`, deny wins, a non-empty user/role list must list the
  creator unless they are the configured owner; the channel through
  `checkChannel`), it SHALL take the ask with the same compare-and-set, which also re-checks
  that the run is still its schedule's newest finished run, and post it
  through the schedule ask post: the schedule prefix and the question, the owner
  pinged for `stuck` and `spend-cap` and the schedule creator for `clarify`
  (AUTONOMY-4), at most once per question per schedule (`askPingKey`) and
  a `spend-cap` ask at most once per cap episode (`claimCapPing`, SAFE-8),
  no reply hint on a `spend-cap` ask, and the pending 80% warning riding the
  post. A post that does not go out (resolves `false` or throws) SHALL hand
  the ask, the warning and the cap ping back, keep no ping key, log a
  scrubbed `[scheduler] ask failed: …` line when it threw, and be retried on
  a later tick. Only one delivery pass SHALL run at a time.
- Staleness. An older pending ask SHALL NOT be posted once a later run of
  that schedule has finished, including a run that finishes while a
  delivery pass is posting another ask, and a deleted schedule's asks SHALL
  NOT be posted. Runs recorded before schema v11 carry no ask and SHALL NOT
  be posted.
- Stop. After the scheduler's `stop()` a delivery pass SHALL take no
  further ask, and the bridge's stop SHALL wait at most
  `ABANDONED_SETTLE_MS` (3 s, `settleAskDelivery`) for a post in flight
  before it closes the gateway, so that ask is either posted or handed back
  for the next start.
- A ticker with no outbound (the daemon) SHALL NOT take or post asks; it
  keeps logging `run.needs_human` (REQ-cli-098).

No new slash command, env var, DM or channel.

Acceptance Criteria
- A daemon-wired scheduler's stuck run stores `ask_reason` `stuck` and the question with `ask_posted_at` null and posts nothing; a bridge-wired scheduler on the same DB posts it on its next tick once, to the schedule channel, with the prefix, the stuck headline, the question and the owner mention (`mentionUserIds` [owner]); later ticks post nothing more.
- A daemon clarify ask posts with only the schedule creator mentioned.
- A daemon spend-cap ask pings the owner with the pending 80% warning and no reply hint; a second one in the same episode posts without a ping; an episode another surface already pinged posts without a ping.
- The same question from two daemon runs pings once; of two pending asks of one schedule only the newest posts.
- A later finished run, or deleting the schedule, leaves nothing to post.
- A later run that finishes while a delivery pass is posting another schedule's ask makes that schedule's pending ask moot: it is not posted.
- After `stop()` a delivery pass finishes the post in flight and takes no other ask (it stays pending for the next start); `settleAskDelivery(ms)` resolves false while that post is still going; the bridge's stop closes the gateway only after a pending-ask post in flight resolved.
- A channel the bridge's allowlist refuses gets no post and the ask stays pending.
- A creator the bridge's live allowlist no longer lists, or deny-lists, gets no post and the ask stays pending; once `/admin` puts them back (the shared allowlist edited in place) the next tick posts it with its ping.
- A post that resolves `false` or throws leaves the ask pending with no ping key (the throw is logged); the next tick posts it with the ping.
- A run the bridge claimed and posted is not posted again by its ticks; two bridge tickers on one DB post a pending ask once.
- A v10 DB migrates to v11 keeping its runs, none of which is pending; a secret in the question is redacted at rest and in the post; `rescrubDatabase` re-scrubs `ask_question`.
- `corvidinho daemon` logs `run.needs_human` for a stuck run and a Discord bridge started on the same data dir posts the ask to the owner once.

### REQ-discord-072

A Discord session SHALL keep its thread (AGENT-6, with DISCORD-2 /
DISCORD-2.a "so the conversation stays coherent"). Every agent run on a
session SHALL be recorded with that session as two turns: the human's own
words for that run (the routed message text before memory, identity and
image enrichment; the picked option's label for a button pick; the topic of
`/session start`; the description of `/work`), recorded as the run starts so
a run that throws or a bridge that dies mid-run still keeps the request, and
the answer the bridge posted (the summary, the ask text, or the failure line,
also when the run throws). A button ask, whose Choose stub does not show the
question, SHALL be recorded as its question and choices. A SAFE-8 spend-cap
stop SHALL record no answer turn, so no cap text reaches a later prompt
(REQ-discord-098).

When a run continues a live session (a reply to a tracked bot message, a
message in the session's thread, the same user's @mention in the same
channel, or a button pick that resumes it), the bridge SHALL put the
session's earlier turns, oldest first, in one labelled block
(`SESSION_THREAD_HEADER` … `SESSION_THREAD_FOOTER`, turns labelled
`Human:` / `You (Corvidinho):`) ahead of the new message and any
pending-ask block, before identity and memory are added. The block SHALL fit
a fixed character budget (`SESSION_THREAD_BUDGET_CHARS`, 6000; each turn
clipped to `SESSION_THREAD_TURN_MAX_CHARS`, 1500): the session's opening
request and as many of the newest turns as fit SHALL be kept, and the turns
between SHALL be replaced by one `(N earlier turns omitted)` marker. The
block SHALL open with a `[Corvidinho …]` header and hold no blank line
(blank lines inside a turn are collapsed), so Planning module selection
leaves the whole block out and earlier turns or the header never pick a
module the new message does not name (REQ-agent-004). A clipped turn SHALL
never end on half a surrogate pair. No model summarising. A session keeps
at most `SESSION_THREAD_MAX_TURNS` (200) turns: past it the oldest turn
after the opening request is dropped.

Turns SHALL persist in the shared SQLite DB in the module-owned
`discord_session_turns` table (CREATE TABLE IF NOT EXISTS when a
`SessionStore` opens the DB, no schema version bump; rows cascade with
their session) so the thread survives a bridge restart within the soft TTL
(REQ-discord-019). Turns SHALL live only as long as their session: ending a
session, or its idle expiry past the soft TTL, SHALL delete its turns, and a
session that starts fresh SHALL get no replay (SESSION-2/3; longer-term
continuity comes from MEMORY, SESSION-4). A session belongs to one Discord
user (SESSION-MULTI-1), so no other user's run SHALL ever see its turns.
Turn text SHALL be passed through `scrubSecrets` before it is kept or
replayed, and `discord_session_turns.content` SHALL be listed in
`SCRUB_TARGETS` (SAFE-6). The run's `humanText` (the only source of SAFE-4
confirm tokens) SHALL stay the current message only. No new env var, config
key, CLI flag or slash command; WATCH and CLI `task run` are unchanged.

Acceptance Criteria
- A reply to the bot's answer continues the session with `resume: true`, and its prompt holds the earlier request and answer, oldest first, before the new message; `humanText` is the new message only.
- The same user's @mention that continues their live session in the channel, and each further reply, carries every earlier turn in order.
- After a bridge restart on the same DB file within the soft TTL, a reply to the earlier answer continues the session and its prompt holds the earlier request and answer.
- A reply to a `/session start` or `/work` answer carries that topic or description and its answer.
- The human's request is in the DB while its run is still going (a bridge restarted mid-run finds it), and a run that throws (chat, `/session start`, `/work`) keeps the request and the failure line, so the next message, or a reply to the failure, carries them.
- `planningSelectionText` of a continued run's prompt is the new message only: the block's header and earlier turns (multi-paragraph answers included) pick no module, and a module the new message names still counts; a turn clipped next to an emoji never ends on half a surrogate pair.
- A button pick's resumed run carries the original request (not only the question and the label); a later reply carries the request, the question, the picked label and the answer.
- A spend-cap stop keeps the human's request in the thread; the next prompt holds no spend-cap text and no pending-ask block.
- A long thread renders within the budget: the opening request right after the header, one marker whose count is exactly the turns left out, then the newest turns ending with the newest answer; one huge turn is clipped.
- A session idle past the soft TTL starts a new session whose prompt holds no earlier turn; ending or expiring a session deletes its turns (memory and DB); orphan rows left by an older build are swept on load.
- Another user's session in the same channel (by @mention or by replying with the ping to my answer) never sees my turns, and my continuation never sees theirs.
- Stored turns hold `[redacted:github-token]` instead of a `ghp_` token (in memory, in the DB, and in the replayed prompt); `rescrubDatabase` rewrites a raw row in `discord_session_turns`.
- The turns table is created on `SessionStore` open without changing `schema_meta.version`, idempotently.

### REQ-discord-353

A schedule SHALL NOT stop, or fail to start a run, silently (AUTONOMY-2:
"When stuck, it pings the configured owner on Discord rather than dying
silently"). Two schedule-run outcomes SHALL record a `stuck` ask on the
run's `schedule_runs` row, so the REQ-discord-347 ask post and delivery
pass ping the owner:

- Pre-run failure. A run whose project cannot be resolved (`project resolve
  failed: …`) or whose worktree cannot be created (`worktree failed: …`),
  including a step that throws instead of returning an error, SHALL still
  spawn no agent and be recorded failed with that full error,
  and SHALL record a stuck ask whose question is fixed text naming the step
  (`PROJECT_RESOLVE_FAILED_QUESTION`, `WORKTREE_FAILED_QUESTION`), never the
  host path or the error text (REQ-discord-418, SAFE-6), so a repeat of the
  same failure keeps one ping key.
- Auto-pause. The run whose failure makes `FAILURE_AUTO_PAUSE` (5) failures
  in a row, counted in SQL in the same run-finish transaction as today
  (REQ-discord-108), SHALL store the stuck `autoPauseAsk` in that same write
  instead of its own ask: `Paused after 5 failed runs in a row. Fix the
  cause, then resume it with /schedule resume.`, followed by a
  `Last failure: <question>` line when the run stopped with its own ask. The
  pause itself is unchanged (status `paused`, ping key cleared). A run that
  succeeds SHALL never store it.
- Delivery. A ticker that can post (the bridge) SHALL post such an ask of
  its own run at once through the in-process ask post of REQ-discord-347
  (live DISCORD-SCHEDULE-3 gate, compare-and-set take, schedule prefix, stuck
  headline, the owner mentioned, once per question per schedule through
  `askPingKey`); the pausing run's ask SHALL replace its plain `❌` post.
  When the pausing run had no ask of its own, the post's context SHALL be
  only what that `❌` post showed (`failed (exit N)`, the summary the run
  row keeps and the delivery pass posts), never the run's own output; a run
  that throws posts its pause ask at once with no context. An in-process
  post of the pause ask that does not go out (resolves `false` or throws)
  SHALL hand the ask back with no ping key kept, so a later delivery pass
  posts it: a paused schedule has no next run to post it. An ask a ticker
  with no outbound (the daemon) recorded SHALL be posted by the bridge's
  next delivery pass. `ScheduleRunFinished.askReason` SHALL be
  `stuck` for these runs, so the daemon logs `run.needs_human`
  (REQ-cli-098).
- Gate. A run the DISCORD-SCHEDULE-3 gate refuses (REQ-discord-020) SHALL
  still record no ask of its own and post nothing; when refused runs
  auto-pause the schedule, the pause ask SHALL stay pending until the gate
  passes, like any pending ask.

No new slash command, env var, config key, table, column or schema version;
`/schedule resume` is the existing ADMIN subcommand.

Acceptance Criteria
- A daemon-claimed run that makes 5 failures in a row pauses the schedule and stores `ask_reason` `stuck` with the pause question and `ask_posted_at` null; `onRunFinished` reports `autoPaused: true` and `askReason: "stuck"`; the bridge's next tick posts it once with the schedule prefix, the stuck headline, the pause line, the `failed (exit 1)` context and `mentionUserIds` [owner]; the 4 earlier failures record no ask and post nothing.
- A stuck run that makes the 5th failure posts one ask: the pause line followed by `Last failure: <its question>`.
- A bridge-claimed run that makes the 5th failure posts the pause ask with the owner ping and the `failed (exit 1)` context (not the run's output) instead of the `❌` line (the 4 earlier ones post `❌` with no ping), records the ping key and is not posted again.
- A bridge-claimed pause ask whose post resolves `false` or throws stays pending with no ping key; the next tick posts it once with the owner ping.
- A bridge run that throws and makes the 5th failure posts the pause ask at once with the owner ping and without the error text.
- Refused runs that auto-pause the schedule spawn no agent and post nothing; once the creator is allowed again the next tick posts the pause ask with the owner ping.
- A daemon run whose project cannot be resolved spawns no agent, keeps `project resolve failed: …` (with the host path) on the row and stores the fixed question; the bridge posts it with the owner ping and without the host path; the same failure again posts without a ping.
- A bridge run whose worktree cannot be created keeps `worktree failed: …` on the row and posts the fixed question at once with the owner ping, once; so does one whose worktree step throws.
- The pause ask is chosen by the failure count in SQL: a store handle whose cache is stale stores it when SQL reaches 5; a success stores no ask and resets the count.
### REQ-discord-431

Channel autocomplete on the STRING `channel` options (`/admin channels add|remove`, `/announce channel`) SHALL list channels only for ADMIN invoking from an allowlisted channel (DISCORD-DENY-3 / ADMIN-4). The check SHALL be re-run on every autocomplete request, never trusted from registration, in the slash gate order: the interaction's channel passes the channel allowlist (`gateChannel`), the actor passes `gateActor` (deny users/roles win; a non-empty user/role allowlist applies), and `resolvePermissionLevel` with the live mute set is ADMIN (the configured owner; no owner means nobody, IDENTITY-3). Otherwise the gateway SHALL answer an empty choice list, so no channel name, id or allowlist entry reaches a non-admin. The gateway SHALL also answer an empty list when no gate is wired or the gate throws (fail closed). An allowed request SHALL keep today's choices: guild text channels for `add` and `/announce channel`, and the live allowlist for `remove`. Autocomplete SHALL NOT consume a rate-limit slot. No new slash command, option, env key or schema version.

Acceptance Criteria
- The owner in an allowlisted channel gets guild text channel choices for `/admin channels add` and `/announce channel`, and only the live allowlisted channels for `/admin channels remove`.
- A non-owner in an allowlisted channel gets `[]` for all three, including one on the user allowlist (STANDARD).
- The owner in a channel that is not allowlisted gets `[]`.
- The owner holding a deny-listed role gets `[]`, and so does a muted owner (live mute set, no restart).
- With no owner configured, every caller gets `[]`.
- `respondChannelAutocomplete` answers exactly once and answers `[]` when `mayAutocompleteChannels` is unset, returns false or throws. The gate receives `commandName`, `channelId`, `userId` and member `roleIds`.
- Fixture tests only; no live Discord token or network.

