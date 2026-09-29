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

The agent's `discord-post-message` SHALL gate its target channel on this
same union, deny lists first (REQ-plugins-009), so a channel the bridge
listens in through `DISCORD_CHANNEL_IDS` alone can also be posted to.
`discord-send-file` SHALL gate the conversation channel the bridge set (a
thread through its parent, REQ-discord-476) on the same union, deny lists
first, so it can attach in every channel the bridge talks in.

Acceptance Criteria
- DISCORD_CHANNEL_IDS and/or file/env channels union; empty → empty_channels error.
- A malformed allowlist file → `allowlist` error; the bridge does not start.
- A multi-line `deny_channels` loads and refuses its channel.
- `/admin users add` on a file with a multi-line `users` array keeps the existing entries, and the reloaded file keeps `deny_users` and `[github].deny_repos`.
- `/admin users add` on a file whose `[discord]` has only a multi-line `channels` array (LF and CRLF), and `/admin channels add` after a multi-line `deny_users`, put the new key after the closing `]`; the file reloads with every list intact.
- A `]` or `#` inside a quoted item survives an `/admin` rewrite; the comment on the edited key's first line is kept.
- A rewrite that would not reload as intended (an entry the one-line writer cannot quote) is refused and the file is left byte-for-byte unchanged.
- `discord-post-message` to a channel listed only in `DISCORD_CHANNEL_IDS` passes the channel gate (dry run exit 0); a deny on that channel still refuses (exit 3).
- `discord-send-file` in a conversation channel listed only in `DISCORD_CHANNEL_IDS`, or a thread whose parent is, attaches; a channel in no list is refused (not allowlisted) and a deny on that channel still refuses (is denied).

### REQ-discord-005

When DISCORD_TOKEN and DISCORD_BOT_TOKEN are both missing, the CLI/doctor/bridge SHALL explain the requirement and exit cleanly without crashing. Secrets SHALL never be committed to the repo.

Acceptance Criteria
- `corvidinho discord bridge` without token exits non-zero naming DISCORD_TOKEN / DISCORD_BOT_TOKEN and go-live checklist.
- The go-live checklist (`goLiveChecklist()`, printed by `doctor` and `discord bridge`) says users and roles both empty admit anyone in an allowlisted channel and once either is set only those users, role holders and the owner (REQ-discord-043); it never says empty user/role lists are deny-all.

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

An ask button press (DISCORD-ASK, open or pick) SHALL run the same mute and
rate limit check against the same per-user state as chat and slash, after the
channel gate (REQ-discord-212) and the actor gate (REQ-discord-201). The
level that `rateLimitByLevel` keys on for a press SHALL be the presser's
level from `resolvePermissionLevel` (user id, role ids, allowlist, configured
owner; mute is checked first). A press needs an ack, so a muted presser SHALL
get the ephemeral `MUTED` reply and a rate-limited one the ephemeral
`RATE_LIMITED` reply. On either refusal the agent SHALL NOT run, nothing
SHALL be sent or edited, and the pending ask SHALL stay as it was, so a muted
user cannot keep a session going by buttons. No new env var, slash command,
table or column.

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
- A muted session owner's ask button press (open or pick) gets only the ephemeral `MUTED` reply, press after press: the agent does not run, nothing is sent or edited, and the ask stays pending; after `/unmute` the same button resumes the session.
- With `DISCORD_RATE_LIMIT_MAX=1`, a member's pick after their @mention gets only the ephemeral `RATE_LIMITED` reply and the ask stays pending, while another user is still served; with `DISCORD_RATE_LIMIT_BY_LEVEL={"3":100}` the owner's pick after their @mention still resumes.

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

In a run the bridge started (a non-empty `CORVIDINHO_ACTING_DISCORD_USER_ID`,
set per spawn by the bridge, REQ-discord-021), the requesting user SHALL be
that acting user: `discord-post-message` SHALL run the requester check for the
acting user even when no `--requesting-user-id` is passed, and a
`--requesting-user-id` / `--requester` naming a different user SHALL be
refused with nothing posted, never checked in place of the acting user. When
the acting user's check cannot run (the Guild Members login is refused, times
out or errors), the post SHALL be refused with nothing posted and the error
SHALL say why in one scrubbed line (SAFE-6). With the acting env empty or
unset (operator `plugins run`, local `task run`, WATCH), the requester check
SHALL run only for a passed `--requesting-user-id` and strict mode SHALL
refuse a post without one, as before. No env var, flag, config key or command
is added.

Acceptance Criteria
- Requester lacks send/view → refuse; no post.
- Requester has View+Send + allowlisted channel → may post (dry-run ok in tests).
- Strict mode + missing requesting_user_id → refuse.
- Allowlist deny still wins before requester check.
- No ProcessManager; secrets out of repo; default-deny unchanged.
- Bridge run (acting user set), no `--requesting-user-id`: the check runs for the acting user; a denial refuses and nothing is posted; an allowed acting user posts once.
- Bridge run: `--requesting-user-id` / `--requester` naming another user → refused (exit 3), not checked, nothing posted; naming the acting user → the one check for that user.
- Bridge run + strict mode, no `--requesting-user-id` → the acting user's check satisfies strict mode.
- Bridge run, the check cannot run (the checker throws; the live Guild Members login is refused, e.g. Server Members Intent off) → refused (exit 3) with the reason in one scrubbed line that names Server Members Intent; the bot token never appears; nothing posted.
- Bridge run: the channel allowlist deny still wins before the acting user check.
- Acting env empty or unset: no flag posts without a check; the flag checks the named user; strict refuses a missing id; a throwing check still throws.
- With no injected checker, `verifyRequesterCanSend` runs its own discord.js check (gateway login stubbed to be ready on a fake guild text channel, no token or network): a requester without both View Channel and Send Messages is refused with status 403, one with both is allowed, a requester not in the guild is refused (403), and a missing or non-text channel is refused (404).
- With `attachFiles`, the same live check refuses a requester with View Channel + Send Messages but no Attach Files (403, the attach reason) and allows one with all three (REQ-discord-476).
- `discord-post-message` in a bridge run, through that live check, posts nothing when the acting user cannot send and posts once when they can.
- These tests fail when the `permissionsFor` View Channel + Send Messages check (or the Attach Files check) is disabled.

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
A cron step SHALL be 1 or more in every field: a zero step (`*/0`, `a-b/0`,
`n/0`, also inside a comma list) SHALL be refused as a `CadenceError` before
the field is expanded, so `/schedule create` replies with that message
ephemerally and creates nothing, and the store's next-run computation
(create, resume, claim) throws the same error. A range SHALL be expanded only
up to its field's maximum, so a range whose end is past it (`0-99999999999`)
resolves at once and the other cadence rules apply. No cadence SHALL hang the
bridge process that parses it (DISCORD-SCHEDULE-4).
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
- A zero cron step (`*/0 * * * *`, `0-59/0 * * * *`, `0,*/0 * * * *`, `5/0 * * * *`, or `/0` in the hour, day, month or weekday field) is refused with the ephemeral `Invalid cron step in "…": the step must be 1 or more.`, nothing is created, and the bridge keeps answering; `parseCron` / `getNextCronDate` throw the same `CadenceError`.
- A range past its field's maximum resolves at once: `0-99999999999 * * * *` is refused by the 5-minute rule and `0 0-99999999999/2 * * *` runs like `0 */2 * * *`; cadences with steps of 1 or more resolve as before.
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

Each memory row SHALL be scoped to `owner_user_id` (acting Discord user id;
since #101 a declared person's `person:<id>` profile scope or a project's
`project:<key>` scope, REQ-discord-101).
Reads and writes SHALL default to that user’s scope only (MEMORY-ACL-1).

Forget, delete, overwrite, and re-attribute operations SHALL require ADMIN
permission re-checked at handler time (MEMORY-ACL-3/4, ADMIN-4, DISCORD-7),
including **self-forget** of one’s own memories. Empty admin/owner lists SHALL
deny-all for forget/override. A non-admin attempt against another user’s
memories SHALL be refused without leaking the other user’s content
(MEMORY-ACL-2). Soft-delete MAY retain audit fields (`deleted_at`,
`deleted_by_user_id`). The one other forget path is a person's own forget
request, carried out only once the owner approves it on a card
(MEMORY-ACL-6, REQ-discord-101).

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
SHALL be `conversation` | `entity` | `person` | `personality`, plus the
profile categories `project` | `preference` | `decision` | `ask` |
`approval` (MEMORY-5) and private notes `private` (MEMORY-7). Fixture tests
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
- The profile and private-note categories are accepted; a default recall leaves private notes out.
- A declared person's rows use the `person:<id>` scope and a project's the `project:<key>` scope (REQ-discord-101).

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
session topics, the session's open asks (question and option labels in
`discord_sessions.pending_ask`), work task descriptions/summaries, schedule
names/descriptions/prompts, schedule run summaries/errors, and memory
keys/content (SAFE-6).
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
rule. Version 3 adds the open asks: a stored `pending_ask` (one JSON object,
or an array when several asks are open) SHALL be parsed, its text values
scrubbed and the document re-serialized, so the row stays valid JSON (a text
scrub could cut it: a private-key block with no END line runs to the end of
the text). Every string value is scrubbed, ids included. A model-chosen option
id that looks like a secret SHALL be replaced by its position when the ask is
made, so the ids an ask carries (askId, option ids, stubMessageId) never look
like a secret and, with expiresAt, stay byte-identical on write and on
re-scrub, so open buttons keep working; an older row's secret-looking id is
redacted like any stored text. A stored value that does not parse SHALL be
scrubbed as text and counted; the log line SHALL name the column and the
count, never the stored text. No CLI
or slash surface is added. Outbound reply scrubbing beyond the
spawned-run summary text (REQ-agent-232) and a Discord-admin re-scrub command
are draft SAFE-10 and out of scope until captured.

Acceptance Criteria
- Each vendor shape is redacted; ordinary text is untouched; scrub is idempotent.
- Hostile input (many private-key or JWT openers with no closer) scrubs in linear time.
- A private-key block with no END line is redacted through the next BEGIN line or the end of the text; full blocks are still redacted one by one; public-key and certificate blocks are unchanged.
- Sessions, work tasks, schedules, schedule runs and memories persist scrubbed.
- Rows written before the current rules are re-scrubbed on next open; second open is a no-op.
- A button ask and a free-text ask whose question or option label holds a fake vendor key are stored in `discord_sessions.pending_ask` as `[redacted:<kind>]`, in the one-object and the array row; the session reloads with the same askId, option ids, expiresAt and stubMessageId.
- A raw `pending_ask` row (one object or an array) from an older build is rewritten on the next open after `SCRUB_RULES_VERSION` rises, stays valid JSON with its ids byte-identical even when a question holds a private-key block with no END line, and still loads as the session's open asks; a second open is a no-op.
- A `pending_ask` value that is not JSON is scrubbed as text and counted (`jsonUnparsed`); the warning names the column and count, never the stored text.
- A model-chosen option id that looks like a secret is replaced by its position when the ask is made, so neither the button nor the stored row carries it; an id that reaches the row another way is stored redacted, and an older row's secret-looking option id is redacted by the re-scrub while its other ids stay byte-identical.
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
subcommand groups `users add` (ADMIN-1), `channels add|remove` (ADMIN-2),
`config show` (ADMIN-3) and `people list|add|link|unlink|remove` (ADMIN-3.a,
REQ-discord-036) plus `people role` (ADMIN-3.b, REQ-discord-065). The dispatcher SHALL require ADMIN and the handler
SHALL re-check ADMIN before doing anything else (ADMIN-4 / DISCORD-7); with
no owner nobody can run it (IDENTITY-2/3).

The `users` / `channels` mutations SHALL edit only `[discord].users` / `[discord].channels` in the
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
display, the number of declared people (and of problems in their entries)
and of team and community roles among them, and which knobs are updatable
(declared people and their roles included). Each mutation SHALL append SAFE-5
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
- `/admin config show` shows the declared-people count with the problem count and names `/admin people add|link|unlink|remove` among the updatable knobs.
- The `/admin` body has the groups `users`, `channels`, `config` and `people` (`list`, `add`, `link`, `unlink`, `remove`, `role`), still nine top-level commands; `role` takes `person` and `role` with the choices `team` / `community`.
- `/admin config show` counts team and community roles among the declared people and names `/admin people role` among the updatable knobs.

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

The PR step SHALL run only for the owner (ADMIN) or a declared team member
(IDENTITY-10; the role is re-resolved from the live people list after the
run, REQ-discord-065); community /work runs keep the changes on the work
branch (ROLES-CHAT-3).

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
- A /work by anyone other than ADMIN (the owner) or a declared team member (IDENTITY-10, re-resolved from the people list after the run) never runs the PR step (ROLES-CHAT-3); the reply says the changes stay on the work branch.
- A team member's /work reaches the PR step with the same gates as the owner's; a team member demoted during the run does not.
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

Pending asks SHALL be keyed by askId, not one per session (SESSION-MULTI-3).
When a later run of the same session asks again (a chat message sent while a
button ask is open, or the run a pick resumes), the new ask SHALL become the
session's `pendingAsk` (the one a thin-ack continue restates and a free-text
reply answers) and every earlier button ask SHALL stay open, so its Choose and
option buttons keep working until pressed or expired; a superseded free-text
ask is replaced. A button press SHALL be matched to the session's open ask
with that askId, whichever of its open asks it is. A pick, a late press or a
free-text answer SHALL clear only that ask, and the newest remaining open ask
that has not timed out SHALL become `pendingAsk` (earlier asks already past
their timeout are dropped then, never promoted, so a thin-ack continue never
restates expired buttons); an explicit cancel SHALL clear every open ask of
the session. Open asks SHALL persist in `discord_sessions.pending_ask` with
no schema change (one JSON object when one ask is open, as before; a JSON
array, oldest first, when several are) and reload with the session. No new
env var, config key, slash command, table or column.

A `/work` or `/session start` run that stopped with a clarify or stuck ask
SHALL store that ask as its session's pending ask, and `/work` SHALL record
the task `blocked` (a stuck ask stays `failed`), never `completed`
(AUTONOMY-1). When the ask's choices fit a short list (ask-human `options`,
else a numbered list parsed from the question, as in REQ-discord-045), the
slash answer SHALL be the public Choose stub with its Choose button, as in
chat (DISCORD-ASK-1/4): the stub SHALL NOT show the question or the options
(DISCORD-ASK-2), the stored pending ask SHALL keep the options and the answer
message id as its stub, and the requester's Choose press and pick SHALL
resume that session in the stub (DISCORD-ASK-3). The Choose button SHALL stay
on the answer when the owner notice has to be appended to it. When the
options cannot be listed, the pending ask SHALL be free text and the slash
answer SHALL show the question as text (DISCORD-ASK-4). The slash answer
message SHALL be bound to its session like a chat reply (DISCORD-2), so a
reply to it by the requester continues that session and the rules above apply
(AUTONOMY-5/6). A SAFE-8 spend-cap stop SHALL NOT be stored as the pending
ask and SHALL NOT get Choose buttons.

A continue that is not an explicit cancel, while the session's `pendingAsk`
is a button ask past its timeout, SHALL first clear that ask as a late press
does (`clearPendingAsk`), before the thin-ack rule applies: the newest
remaining open ask that has not timed out SHALL become `pendingAsk` (earlier
timed-out asks are dropped), so a thin-ack continue restates that live ask,
or, with none left, runs the agent, and SHALL NOT restate the timed-out ask's
stub or its Choose button (DISCORD-ASK-5). A substantive continue then runs
the agent as before, and an explicit cancel still clears every open ask with
the short ack and no agent run.

Acceptance Criteria
- Clarify mentionUserIds is [requester] when provided; stuck is [owner].
- Thin ack restates; pendingAsk remains.
- Cancel clears pendingAsk.
- Free-text substantive continue clears pending and runs agent.
- Button pending survives unrelated chat turns until pick/cancel/expiry.
- `/work` with a clarify ask whose options cannot be listed: the task is `blocked`, the session's pending ask is the free-text clarify ask, and the collapsed answer message maps to that session.
- A thin reply (`ok`) to a free-text `/work` answer restates the question (requester mention, reply hint) and does not run the agent; the pending ask remains.
- `cancel` in reply to the `/work` answer clears the pending ask with the short ack and does not run the agent.
- A substantive reply to a free-text `/work` answer resumes the same session (`resume: true`) with the prior question and the human answer in the prompt, and clears the pending ask.
- `/work` or `/session start` stopped at the spend cap stores no pending ask; a later `ok` to the `/work` answer runs the agent with no prior-question or cap text.
- `/session start` with a clarify ask: the pending ask is stored; a thin reply restates, a substantive reply resumes with the question.
- `/session start` with a clarify ask that has a single structured option (not a list): the pending ask is free text (no options), so a substantive reply answers and clears it.
- `/work` with a stuck ask: the task is `failed`, the pending ask is stored; the owner is pinged once by the separate notice post (the answer itself pings nobody), and a thin reply restates the question with allowed mentions limited to the owner (never the requester).
- A reply to the `/work` answer by another user (`ok`, `cancel` or a substantive answer) neither runs the agent nor clears or restates the requester's pending ask (SESSION-MULTI-1).
- A finished `/work` run (`completed`) stores no pending ask and its answer still continues the session.
- Without an editable thinking message the pending ask is still stored, and an @mention `ok` from the requester restates it without running the agent.
- `/work` with a clarify ask that has structured options: the task is `blocked`; the collapsed answer is the Choose stub (requester mention and the Choose hint; no question, options or reply hint) with one Choose button, followed by the one requester ping post; the pending ask keeps the options with the answer message id as `stubMessageId`; the requester's Choose press opens the ephemeral question with the option buttons, and a pick resumes the same session (`resume: true`, the chosen label) with the answer edited into the stub.
- `/session start` with a numbered list in the question: the answer is the Choose stub, the pending ask holds the parsed options, and a pick resumes the same session.
- A thin reply to a slash Choose stub restates the stub with its Choose button without running the agent; a substantive reply continues the session and the button ask stays pending.
- `/work` with a stuck ask that has options: the task is `failed`, the Choose stub pings nobody and the owner is told by the separate notice post; when that post fails, the notice is appended to the stub and the Choose button stays.
- Without an editable thinking message, the deferred reply carries the Choose stub and its button, and its message id is the pending ask's `stubMessageId`.
- The stub's message id is recorded only while its ask is still the pending ask of a live session: a pick that already took the ask is not undone, and a session ended before the stub went out is not written back to the DB.
- The live gateway adapter forwards the Choose button on the deferred-reply edit and on a plain reply.
- A spend-cap stop never becomes a button ask, even with options.
- While Choose ask A is open, a chat message whose run asks again with Choose ask B makes B the pending ask and keeps A open: a thin reply restates B, A's Choose button opens A's choices, and a pick of A resumes the session with A's question and the chosen label while B stays pending; a re-press of A is a no-op; B's pick then resumes with B's question.
- While Choose ask A is open, a run that asks a free-text question F makes F the pending ask; a substantive reply answers F (prior-question context) and clears only F, so A is pending again and its buttons still resume the session.
- A late press on an earlier open ask gets `ASK_CHOICE_EXPIRED` and clears only that ask; the newer ask stays open.
- When the newest ask is picked while an earlier open ask has timed out, the earlier ask is dropped, not promoted: the session has no pending ask, a thin reply runs the agent, and a press on the dropped ask is a no-op.
- `cancel` with several open asks clears all of them with the short ack and no agent run; a later press on any of them is a no-op.
- `SessionStore`: one open ask persists as one JSON object; two persist as an array and reload as `pendingAsk` plus `openAsks` after a reopen; re-storing a held askId updates it in place; `findPendingAsk` finds an earlier open ask; clearing the newest promotes the earlier one; a new ask replaces a free-text ask but never a button ask; `null` clears all.
- A thin reply after the session's only button ask timed out runs the agent (no prior-question block), posts no restated stub or Choose button for that ask, and leaves no pending ask.
- A thin reply after the newest button ask timed out, while an earlier button ask is still open and not timed out, restates the earlier ask with its Choose button and does not run the agent; the earlier ask is the pending ask and no other ask stays open.
- A substantive reply after the button ask timed out runs the agent and leaves no pending ask, so a later thin reply runs the agent too.
- `cancel` after the button ask timed out still gets the short ack, runs no agent and leaves no pending ask.

### REQ-discord-045

When an ask has two or more options (from ask-human `options` or a numbered
list parsed from the question), the bridge SHALL post a short public Choose
stub with a button, and on requester press SHALL reply with an ephemeral
interaction listing the option buttons. Button prompts SHALL expire after
about 30 minutes; a late press SHALL get a short "that choice expired".
Free-text clarify SHALL be used only when options cannot be listed.

A late press SHALL include the requester's Choose or option press on an ask
that is no longer open because it timed out and was dropped, not promoted,
when a newer ask of the session was cleared (REQ-discord-044), or because its
session was TTL-purged (SESSION-2 / REQ-discord-019), at runtime or while the
store loads after a restart. Such a press SHALL get the ephemeral
`ASK_CHOICE_EXPIRED` reply, with no agent run, no new session and nothing
posted or edited, never "This choice isn't for you (or it was already
answered)". A still-stored ask past its timeout SHALL keep that reply and be
cleared, and a later press on it SHALL again get `ASK_CHOICE_EXPIRED`. A
re-press after a pick and a press after an explicit cancel SHALL stay no-ops
with today's reply (DISCORD-ASK-8), also once the session is purged. Another
user's press on a live ask, or on an ask that is no longer open, SHALL get
the not-for-you reply and SHALL NOT resume anything (DISCORD-ASK-2/3). The
channel, actor and mute/rate gates (REQ-discord-212 / REQ-discord-201 /
REQ-discord-010) SHALL run before this reply; for an ask that is no longer
open, the channel gate SHALL judge the press against the channel and thread
its session had, as for a live ask, so a late press in the talk's thread
under an allowlisted channel (DISCORD-2.a) gets `ASK_CHOICE_EXPIRED` too. To
tell a late press from another user's, `SessionStore` SHALL keep, for each
ask that leaves past its timeout or with its purged session, only its askId,
the session's Discord user, the ask's expiry and the session's channel and
thread ids (`findClosedAsk`), in memory only and bounded to the newest
`CLOSED_ASKS_MAX` (1000), never the question or option text (SAFE-6). No new
env var, slash command, table or column.

Acceptance Criteria
- Structured or numbered options → stub + components; ephemeral open shows choices.
- Pick resumes the requester session with the chosen label.
- Expired press returns ASK_CHOICE_EXPIRED and clears pending.
- Question without listable options keeps the free-text ask-ping path.
- When the newest ask is picked while an earlier open ask has timed out, the requester's Choose and option press on the dropped earlier ask each get exactly the ephemeral `ASK_CHOICE_EXPIRED`; the agent does not run and nothing is posted or edited; another user's press on it gets the not-for-you reply.
- With two open asks (neither timed out) and the session idle past its TTL, the requester's Choose and option press on each get the ephemeral `ASK_CHOICE_EXPIRED`, no agent run, no session is created and nothing is posted; another user's press on each gets the not-for-you reply, as it does on the live ask before the purge.
- A still-stored ask past its timeout: the first press gets `ASK_CHOICE_EXPIRED` and clears it; a second press by the requester gets `ASK_CHOICE_EXPIRED` again, another user's the not-for-you reply, and the agent does not run.
- A re-press after a pick and a press after `cancel` get the not-for-you / already-answered reply with no run, before and after the session is TTL-purged.
- A muted or deny-listed requester's press on an ask of a TTL-purged session gets `MUTED` / the zero-width ack; once let through the press gets `ASK_CHOICE_EXPIRED`, with no run and nothing posted.
- In a talk inside a thread under an allowlisted channel, the requester's press in that thread on a dropped ask or on an ask of the TTL-purged session gets `ASK_CHOICE_EXPIRED` with no run; another user's press there gets the not-for-you reply; a press from another thread or a non-allowlisted channel, or once the talk's channel has left the allowlist, gets the zero-width ack.
- `SessionStore.findClosedAsk` returns `{ askId, userId, expiresAt, channelId, threadId? }` (no question or option text) for an earlier ask dropped when the newest is cleared, an ask cleared past its timeout, every open ask of a TTL-purged session and every ask of a session row purged on load; never for a pick of a live ask, a cancel or an askId stored again; past `CLOSED_ASKS_MAX` the oldest is forgotten.

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

An ask button press (DISCORD-ASK, open or pick) SHALL also gate the actor
with `gateActor`, after the channel gate (REQ-discord-212) and before
mute/rate, using the role ids the gateway reads from the interaction's member
(`ComponentInteraction.roleIds`, as slash reads them). A refused press SHALL
get only the ephemeral zero-width ack (DISCORD-DENY-3), even from the session
owner; the agent SHALL NOT run, nothing SHALL be sent or edited, and the
pending ask SHALL stay as it was.

Acceptance Criteria
- With `users = ["leif"]` and `deny_users = ["mallory"]`, mallory and an unlisted member get a silent refuse on @mention, reply-to-bot and thread continuation, and no session is created.
- `/work`, `/session start` and `/status` by mallory or an unlisted member return `user_not_allowlisted` with only an ephemeral zero-width ack; no agent run, work task or session is created.
- A listed user, a member with an allowed role, and the owner not on the user list still start sessions and run slash commands.
- With empty user and role lists any member of an allowlisted channel may chat, but a deny-listed user or role is still refused.
- A session owner who is then deny-listed, or who presses holding a deny-listed role, gets only the ephemeral zero-width ack on an ask button (open or pick), also when muted: the agent does not run, nothing is sent or edited, and the ask stays pending.
- With a non-empty user allowlist that leaves out the session owner, their pick gets the zero-width ack; the same member holding an allowed role (role ids from the press) resumes, and so does the owner not on the list.

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

A row whose channel (the thread) or parent channel is on `deny_channels`
SHALL count as not allowlisted even when the other is allowlisted (deny wins,
REQ-discord-212): nothing is edited or posted and the row is deleted.

Acceptance Criteria
- A running reply has exactly one row whose progress id is the sent embed; the row is gone after success, failed exit, ask, thrown error and worktree refusal; ignored or refused messages never add one.
- A reply in a thread records the thread as its channel and the allowlisted parent channel; a button pick's resumed run records a row (request id = the ask stub message) and clears it after.
- A bridge that died mid-reply leaves the row; the next start edits that embed (same channel, same message id) to the error color with the interrupted text, sends no new message, and deletes the row.
- A failed edit, or a row with no embed id, falls back to a reply to the request message with the interrupted text; the row is deleted.
- A row whose channel and parent channel are no longer allowlisted gets no edit and no reply; the row is deleted.
- Edit and reply both failing still lets the bridge start; the row is deleted.
- With no rows, bridge start sends, edits and replies nothing.
- A fresh DB is schema 9 with the table; a v8 DB migrates to 9 and keeps its rows.
- A row in a deny-listed thread under an allowlisted parent, or in an allowlisted thread under a deny-listed parent, gets no edit and no reply; the row is deleted. A row in another thread under the allowlisted parent is still recovered in that thread.

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

Deny SHALL always win over an allowlisted parent (REQ-plugins-005): when a
thread or its parent channel is on `deny_channels`, the thread SHALL count as
not allowlisted on every path, even when the other id is allowlisted. An
@mention, a thread continuation and a reply to a tracked bot message there
SHALL be refused silently as above; an ask button pressed there, or for a
session whose channel or thread is deny-listed, SHALL get only the ephemeral
ack and SHALL NOT resume; a slash command there and a schedule whose channel
is that thread SHALL be refused (both gate the thread id itself); restart
recovery (REQ-discord-311) SHALL post and edit nothing there; and
`discord-send-file` (REQ-discord-476) SHALL upload nothing there.
`isMonitoredConversation` (`permissions.ts`: the thread or its parent is
allowlisted and neither is deny-listed) SHALL be the shared check for
MessageCreate, ask buttons and restart recovery.

Acceptance Criteria
- The owner forwards a tracked bot message from an allowlisted channel into a non-allowlisted channel (with or without an @mention): `routeMessage` returns a silent `ignore` / `refuse` with no reply, the agent is not spawned, and nothing is sent, edited or deleted in that channel.
- A thread message under a non-allowlisted parent does not continue a session whose recorded channel is allowlisted.
- `replyReferenceMessageId` returns undefined for a forward-type reference and for a reference to another channel; it returns the message id for a same-channel reply (default or missing type) and, inside a thread, for a reference to the thread or its parent.
- A reply to a tracked bot message in the same allowlisted channel still continues the same session; a thread under an allowlisted parent still continues its session.
- An ask button pressed in a non-allowlisted channel, or after the session's channel left the allowlist, gets only the ephemeral zero-width ack (the allowlist tip for an admin): the ask stays pending, the agent is not run, and nothing is sent or edited; a press in the allowlisted channel, or in the session's thread under an allowlisted parent, still resumes (DISCORD-ASK-3).
- With `channels = [parent]` and `deny_channels = [thread]`, an @mention in the thread is refused silently (no reply): no session is started, the agent is not run and nothing is posted; a session started there before the deny is not continued by a thread message, a reply to its bot message or a mention.
- A thread under a deny-listed parent is refused even when the thread itself is allowlisted.
- `componentChannelAllowlisted` is false for a press in the deny-listed thread and for a session in it (also when pressed in the parent); the bridge answers only the zero-width ack (the allowlist tip for an admin), the ask stays pending and nothing is sent.
- A slash command in the deny-listed thread gets only the zero-width ack (the tip for the owner); `/schedule create` naming the thread as its channel is refused, and a schedule whose channel is the thread neither runs nor posts at tick.
- The allowlisted parent itself and its other threads are still served (DISCORD-2.a).

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

Every schedule post in the channel — the `✅` / `❌` result line and every
ask post, in-process or from the delivery pass, including the stuck asks
above — SHALL start with the schedule prefix
`Schedule **<name>** (<id>) on <project>`, where the project is shown by
name (`projectLabel`: the last segment of an absolute path, a relative name
as given), never as an absolute host path (REQ-discord-418, SAFE-6): the
whole channel reads it. The run row SHALL keep the full error and the
model's prompt SHALL keep the stored project.

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
- A schedule whose project is an absolute host path posts its `✅` and `❌` result lines, its clarify and stuck asks (bridge-claimed and daemon-claimed) and its pre-run stuck ask (an absolute sibling project that cannot be resolved) with the project's name in the prefix and never the absolute path; the run row keeps `project resolve failed: …` with the path and the model's prompt keeps the stored project.

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

### REQ-discord-446

Every interactive Discord agent run (an @mention / reply / thread chat
message, an ask button pick resume, `/session start` and `/work`) SHALL
prepend the IDENTITY-4 acting-user block to the spawn prompt: the acting
user's Discord id and, when one is known, a display name. The display name SHALL be the
declared person's display when the acting user is a declared person with one
(REQ-discord-036), else the
configured owner's display when the acting user is the owner and it is set,
else the Discord display name on that message or interaction, else its
Discord username; when none is known the block SHALL carry the id only and
SHALL NOT invent a name (IDENTITY-4). An ask button pick resume SHALL take
the names from the press itself: the live gateway SHALL set
`ComponentInteraction.userDisplayName` (guild member display, then member
nickname, then user global name, then user display) and
`ComponentInteraction.userUsername`, trimmed, blank as absent, and the
bridge SHALL pass them to `enrichPromptWithIdentity` as the chat path passes
the message author's. The presser is the session's user (another user's
press never resumes), so the names describe the acting user. No new slash
command, env var, config key, table or column.

Acceptance Criteria
- A non-owner's button-pick resume prompt has `display_name` from the press's Discord display name, or from its username when there is no display name.
- The owner's button-pick resume keeps the owner map display and the `role: owner (ADMIN)` line; the Discord names do not replace the owner display.
- A button pick with no names known injects the Discord id only, with no `display_name` line.
- `componentActorNames` resolves member display → member nickname → user global name → user display for the display name and trims the username; blank or missing values are `undefined`.
- A discord.js button press through the live gateway's InteractionCreate listener reaches `onComponent` with the presser's `userDisplayName` and `userUsername`, and with neither when no name is known.
- The chat path, `/session start` and `/work` keep their identity inject unchanged.
- No new slash command, env var, config key, table or column; SQLite schema version unchanged.
- Regression tests in `tests/discord.identity-pick.test.ts` fail on `main` and pass after.
- A declared person's declared display name wins over the Discord display name and username on every interactive run; with nobody declared the block is exactly as before (REQ-discord-036).

### REQ-discord-205

Every Discord post the bridge or its agent makes SHALL parse no mentions
from its content (DISCORD-8 confused deputy; ROLES-CHAT-3 / ROLES-CHAT-8:
text steered by a non-owner's prompt or by public GitHub content SHALL NOT
use the bot's own mention powers). The live gateway's discord.js `Client`
SHALL default `allowedMentions` to `{ parse: [], repliedUser: true }`, and
every outbound payload SHALL set `allowedMentions.parse = []` explicitly:
gateway `reply` (chat mention / reply-continue / thread replies, refusal and
worktree-failure replies, schedule tick and announce posts), `editMessage`
(DISCORD-ASK collapse edits), thinking embed sends and edits, slash `reply` /
`editReply` (including the `/session start` and `/work` deferred public
replies), and ask-button component `reply` / `update`. So `@everyone`,
`@here`, `<@&role>` and `<@user>` in the text SHALL never ping. A reply
SHALL still ping the author it replies to. The only other pings SHALL be
users the caller names in `mentionUserIds`: the requester on a clarify ask
and the owner on a stuck ask or spend-cap stop (REQ-discord-044,
AUTONOMY-2/4, SAFE-8); an empty or missing list pings nobody else. `@everyone` / `@here` SHALL
also be defanged (zero-width space) in all outbound text before the
1900-character cap. The agent's `discord-post-message` REST post SHALL send
`allowed_mentions: { parse: [] }` and the defanged text. No new slash
command, env var, config, table or column.

Acceptance Criteria
- A chat reply (mention and reply-continue) whose summary contains `@everyone`, `@here`, `<@&id>` and `<@id>` is sent with `allowedMentions.parse` empty, no `roles` / `users`, `repliedUser: true`, and no literal `@everyone` / `@here`.
- The `/session start` and `/work` deferred public replies (`editReply`) and ephemeral slash replies carry `allowedMentions.parse` empty and defanged text.
- The live client default, thinking embed sends and edits, `editMessage`, ask-button component replies/updates, and schedule tick posts carry `parse: []`.
- An ask post allows exactly the users it names (`users: mentionUserIds`, e.g. `[owner]`); an empty list allows no user.
- `discord-post-message` sends `allowed_mentions: { parse: [] }` and defanged text.
- Fixture tests inject a fake discord.js into the real live gateway and stub fetch for the plugin; no live Discord or network.

### REQ-discord-476

The agent SHALL be able to attach a file or image (screenshots, logs, diffs,
charts) to its reply in the conversation's channel (DISCORD-17) through the
plugin `discord-send-file`, registered by `loadDiscordPlugins` as
dangerous (SAFE-1 allowlist, SAFE-5 audit through `runPlugin`), mutating
(ROLES-CHAT-3: non-owner, WATCH and schedule runs are refused before it runs)
and minTier 1. It SHALL attach only in the channel the bridge set for the run:
the spawn client SHALL always write `CORVIDINHO_DISCORD_REPLY_CHANNEL_ID` and
`CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID` from
`AgentRunChatOpts.replyChannelId` / `replyParentChannelId` (empty when
unset, never inherited); chat, reply-continue, thread and ask-button runs SHALL
pass the conversation's channel (the thread, with its parent, in a thread) and
`/session start` / `/work` the command's channel; schedules SHALL pass none.
A `--channel` / `-c` argument SHALL be refused, and a run with no
conversation channel or no acting user SHALL be refused, nothing sent. The
channel allowlist SHALL gate first (a thread as itself or through its parent,
DISCORD-5), then the DISCORD-8 requester check SHALL run for the acting user
with View Channel, Send Messages and Attach Files (`verifyRequesterCanSend` option
`attachFiles`); a check that cannot run SHALL refuse. The file SHALL be at
most 8 MB (Discord's default upload limit) and SHALL be a PNG, JPEG, GIF or
WebP image whose magic bytes match its extension, or UTF-8 text with a
`.txt`, `.log`, `.md`, `.diff`, `.patch`, `.json` or `.csv`
extension; text (and the optional caption) SHALL be secret-scrubbed (SAFE-6:
vendor-key shapes and set secret env values, `redactSecretEnvValues`) before
upload, and the caption SHALL parse no mentions (REQ-discord-205). SAFE-2
protected paths (`.env*`, `.git`, `fledge.toml`, `bunfig.toml`,
`specs`, `*.spec.md`, keystores), any `.specsync` path and secret paths
(`.ssh`, keys, credentials) SHALL be refused, judged on the path as given and
on where it resolves inside the project root with symlinks followed; a path
that leaves the project SHALL be refused. `--git-diff [--staged]` SHALL
attach the worktree (or index) diff as `changes.diff` (`staged.diff`) with
secret paths excluded (a secret path that slips through refuses) and the text
scrubbed, so a large diff goes as a `.diff` attachment. A Discord 413 / code
40005 answer SHALL be reported as over the server's upload limit, not retried.
`CORVIDINHO_DISCORD_DRY_RUN=1` SHALL post nothing. No slash command, config
key, table or column is added; the two env vars are bridge-to-run plumbing.

A conversation thread on `deny_channels` SHALL be refused even when its
parent is allowlisted (deny wins, REQ-discord-212 / REQ-plugins-005), before
the requester check, with the `checkChannel` "is denied" error; nothing is
uploaded.

The conversation's channel SHALL pass the gate the bridge serves it by:
`isMonitoredConversation` on the bridge's channel set (allowlist file and
`CORVIDINHO_DISCORD_ALLOW_CHANNELS` union `DISCORD_CHANNEL_IDS`,
REQ-discord-212 / REQ-discord-004). A thread allowlisted by its own id SHALL
pass even when its parent is not listed, and a thread SHALL be refused when
it or its parent is on `deny_channels` (deny wins, REQ-plugins-005), before
the requester check, nothing uploaded. The file SHALL be read once, from one
descriptor opened without following a link at the checked path, and the file
that descriptor holds SHALL be a regular file whose own path is inside the
project and is not a SAFE-2 protected, `.specsync` or secret path: a file or
folder swapped for a link after the path checks SHALL be refused (SAFE-2).
The 8 MB cap SHALL hold for the bytes read as well as for the size first
taken, and no more than the cap + 1 byte SHALL be read: a file that grew
past the cap after its size was taken SHALL be refused before the requester
check, nothing uploaded. An ask-button run in a thread SHALL carry the thread
as the reply channel and its parent.

Acceptance Criteria
- `discord-send-file` is registered dangerous, mutating, minTier 1; its description says it can attach and never to say it can't.
- SAFE-1 denies it when not allowlisted; a non-owner run is refused (ROLES-CHAT-3) before any check or upload.
- A PNG is uploaded to the run's channel as `image/png`, bytes unchanged, `allowed_mentions.parse = []`, after a requester check for the acting user with `attachFiles`.
- A text log is uploaded with vendor keys and the bot token value redacted; the caption is defanged and scrubbed.
- `--channel` / `-c` / `--channel=` and a run with no conversation channel or acting user are refused, nothing uploaded.
- A channel off the allowlist is refused; a thread passes through its allowlisted parent.
- `.env*`, `.git`, keystore, `.specsync`, `specs/`, `.ssh`, `fledge.toml`, symlinks to protected files, symlinks out of the project and outside paths are refused.
- Disallowed types, image bytes that do not match the name and non-UTF-8 text are refused; over 8 MB is refused before any upload; a 413 / 40005 is reported.
- A requester who cannot attach, or a check that throws, sends nothing; dry run uploads nothing; `started` and `ok` audit rows are written.
- `--git-diff` refuses an empty diff and attaches `changes.diff` without secret paths and scrubbed.
- The spawn client writes the reply channel env (empty when none); the bridge passes the conversation's channel on chat, thread, `/session start` and `/work` runs.
- A deny-listed thread under its allowlisted parent is refused with the "is denied" error: no requester check runs and nothing is uploaded; another thread under that parent still passes.
- A thread allowlisted by its own id, its parent not listed, attaches in the thread after the acting user's check; with its parent deny-listed it is refused ("is denied"); a deny-listed thread under an allowlisted parent is refused ("is denied"); an unlisted thread under an unlisted parent is refused (not allowlisted); nothing else is checked or uploaded.
- A file whose size, as first taken, is under 8 MB but which is over it when read is refused with the upload-limit error after at most 8 MB + 1 byte is read: no requester check runs and nothing is uploaded.
- A checked file swapped for a link to `.env`, or whose folder is swapped for a link into `.ssh`, after the path checks is refused (SAFE-2): no requester check runs and nothing is uploaded.
- An ask-button pick in a thread resumes with `replyChannelId` = the thread and `replyParentChannelId` = its parent.

### REQ-discord-734

A run summary that ends with the ROLES-CHAT-3 closing note
`\n\n(not allowed for your role)` (REQ-agent-333) SHALL keep that note
through every cap it meets after `chatBodyFromTaskResult` on its way to a
Discord post. Each such cap SHALL use `clipKeepingRoleNote`
(`src/agent/task-summary.ts`): the text before the note loses its end and
the note stays last.

- A scheduled run's summary SHALL be capped at `POST_SUMMARY_MAX` (1500
  chars) for the run row's `summary` and for the `✅` / `❌` schedule post,
  and in the post also at what fits after the post's head within
  `ASK_REPLY_MAX` (1900), so the gateway's 1900 cut never reaches it.
- The `/work` and `/session start` answers SHALL cap the summary at 1500
  chars and at what fits after the answer's head (task, session, worktree,
  description and PR lines; session, topic and worktree lines) within 1900,
  so the gateway's 1900 cut never drops the note.
- `appendPostLine`, which cuts a post's body so the SAFE-8 80% warning line
  fits within 1900 (chat replies, schedule posts, a slash owner notice that
  rides the answer), SHALL cut the body before the note, end the kept text
  in `…`, and keep the note ahead of the warning line.

`ask-ping.ts` SHALL export `POST_SUMMARY_MAX` and
`clipPostSummary(summary, headLength = 0)` for these caps. A summary that
does not end with the note SHALL be capped exactly as before. An ask's post
(a question or Choose stub, including a stuck ask's 400-char context) is not
changed. No env var, config key, flag, slash command, table or schema change.

Acceptance Criteria
- `tests/scheduler.service.test.ts` "a long summary ending with the note keeps it in the run row and the post; one without is cut as before": the run row's summary is 1500 chars ending with the note; the post (448-char schedule name) is at most 1900 chars and ends with the note; a run without the note stores and posts exactly its first 1500 chars.
- `tests/discord.slash-ask7.test.ts` "/work answer for a non-owner keeps the closing role note within the 1900 cap": the collapsed answer is at most 1900 chars, its summary part is under 1500 (fitted after a long head) and it ends with the note.
- Same file, "/session start answer for a non-owner keeps the closing role note within the 1900 cap": at most 1900 chars, the summary part at most 1500, ending with the note.
- `tests/discord.spend.test.ts` "the cut for the warning line keeps a closing role note": an 1800-char body ending with the note plus the 80% line is a 1900-char post ending `y…`, the note, a blank line and the warning line; a body that fits is untouched; a long body without the note still ends `…\n\nLINE`.
- With main's `src/discord/ask-ping.ts`, `src/discord/command-handlers/work.ts`, `src/discord/command-handlers/session.ts` and `src/scheduler/service.ts`, these four tests fail; they pass on the branch.

### REQ-discord-036

Declared people (IDENTITY-13, #36). The owner SHALL declare who's who as
`[people.<id>]` sections of the allowlist file (a `people` object in a JSON
file) with `display`, `nicknames`, `discord_ids`, `github_logins` and
`github_ids` (singular spellings read too; one-line values). The person id
SHALL be 1–32 lowercase letters, digits, `-` or `_`; `owner` is reserved.
People SHALL be read from the allowlist file this process loaded (the file
`[owner]` comes from, `AllowlistConfig.sourcePath`), re-read on every use, so
a VM edit or an `/admin people` change applies on the next message, slash run
or WATCH event without a restart; no file loaded means nobody declared. There
SHALL be no second store, env var, config key, table or column, and the
allowlist loader and `[owner]` reader SHALL read a file with people sections
exactly as before.

Fail closed: an entry with any unreadable value (bad Discord snowflake,
GitHub login or numeric id, a list spanning lines, a JSON number for a
Discord id, a duplicate section) SHALL be skipped whole and reported as a
plain-language problem naming the person id and key, never an account id.

`resolvePerson(directory, { discordId, githubLogin, githubId })` SHALL be the
one resolver (for later slices too) and SHALL return `{ personId,
displayName?, role?, person }` or null. It SHALL match only on stable ids —
the Discord user id (or `<@id>`), the GitHub numeric id and the
case-insensitive GitHub login — and never on a display name or nickname
(IDENTITY-7). A login SHALL NOT match when the GitHub numeric id is known and
the person declared other GitHub ids; ids that point at two different people,
and an id declared for two people, SHALL match nobody. The configured owner
(IDENTITY-1) SHALL always be a person: the declared entry holding the owner's
Discord id (the owner's GitHub login added to it), else a built-in `owner`
entry from `[owner]` / env; its `role` SHALL be `owner`. No other role is read
yet (#65 adds roles). No AlgoChat or wallet ids.

Recognised on Discord (IDENTITY-14): every interactive run (chat message,
ask button pick resume, `/session start`, `/work`) SHALL add to the
IDENTITY-4 acting-user block, for a declared acting user,
`declared_person: <id>`, the declared `display_name` (winning over the
Discord names), `nicknames` and `github` logins, matched on the acting
Discord user id only. Once anyone is declared, an undeclared non-owner SHALL
be marked `declared_person: none`, so a Discord display name never passes for
a declared person. An owner who is not declared under `[people]` keeps the
block exactly as before, and with nobody declared the block SHALL be
unchanged. The one exception is SAFE-11 (REQ-discord-071): the
Discord display name / username shown is cleaned first (`cleanDisplayName`),
and a non-owner whose shown Discord name reads like the owner's display or
another declared person's display or nickname gets one `name_clash` line
saying this Discord user id is someone else; recognition and roles stay on
stable ids.

Only the owner changes people (IDENTITY-6, ADMIN-3.a): `/admin people
list|add|link|unlink|remove` (owner-only; dispatcher floor ADMIN plus a
handler re-check) SHALL be the only writer besides editing the file on the
VM; no plugin, chat path or model tool SHALL write people. `add` declares a
person or changes their display name; `link` / `unlink` add or remove one or
more of `discord` (user picker), `github`, `github_id` and `nickname`;
`remove` drops the person and all links; `list` shows the effective people
(owner marked) and any problems, under Discord's 2000-character cap. A
`link` that would put a stable id on a second person (the built-in owner
included) SHALL be refused; an unreadable entry SHALL NOT be edited. TOML
writes SHALL rewrite only that person's read keys (header, comments and
unread keys kept, every other line verbatim), append a new section, or drop a
removed one; JSON writes SHALL change only that person's entry. The rewrite
SHALL be atomic (`writeFileAtomic`) and SHALL be re-read before writing: allow
and deny lists, `[owner]`, every other person and every other section
unchanged, and the person reading back as planned, else refused with nothing
written. Each change SHALL append SAFE-5 audit rows `admin-people-<op>`
(surface `discord:admin`, actor = invoker, args digest only): `started` before
the write, then `ok` / `error`; refusals and a non-owner caught by the handler
append `denied`; no trail wired or a trail that throws SHALL refuse with
`audit log unavailable (SAFE-5)` and write nothing. A bridge that started
without a file SHALL read the file its first `/admin people` change writes.

Acceptance Criteria
- `[people.<id>]` TOML (plural and singular keys) and the JSON `people` object parse to people; the allowlist loader and `[owner]` reader load the same file unchanged.
- Unreadable entries are skipped whole with problems that name the person and key but no account id; `owner` is a reserved id.
- `resolvePerson` resolves by Discord id, `<@id>`, GitHub login (any case, `@`) and GitHub numeric id (number or string); display names and nicknames resolve nobody; a login with a different known numeric id resolves nobody; ids of two different people, and an id declared twice, resolve nobody.
- The owner resolves with `role: owner` as the built-in entry (by Discord id and `[owner]` GitHub login) or as the declared person holding the owner's Discord id; no owner configured ⇒ no owner person.
- People are re-read per call from the loaded file; a missing / unreadable file reads as nobody declared, never a throw.
- A declared chat speaker's prompt names `declared_person`, the declared display (not the Discord one), nicknames and GitHub logins; a stranger with a declared person's display name gets `declared_person: none`; the undeclared owner's and everyone's block with nobody declared are byte-identical to before.
- Through `startBridge`: an `/admin people add` + `link` by the owner and a VM edit of the file change who the next chat message is recognised as, without a restart; a chat message asking to change links changes nothing.
- `/admin people add|link|unlink|remove` edit the file as described, keep every other line verbatim, and each change appends `started` + `ok` rows; no-change requests append nothing.
- Refused: an id linked to another person (including the owner's `[owner]` GitHub login), bad person ids, `owner`, an undeclared person for `link`, invalid link values, an unreadable entry; no audit trail or a throwing trail; the file is unchanged.
- A non-owner is refused at dispatch and at the handler (`denied` row); `list` is owner-only too.
- Only `src/discord/command-handlers/admin.ts` imports the people writer; nothing under `src/` or `plugins/` else does.
- Regression tests `tests/identity.people.test.ts`, `tests/discord.admin-people.test.ts` and `tests/identity.recognise.test.ts` fail on the base sources and pass after.
- SAFE-11 (REQ-discord-071): a stranger named `[owner] L<zero-width>eif` is shown as `display_name: Leif` with a `name_clash` line naming the owner and no owner facts; a stranger named like a declared person gets a `name_clash` line naming that person; the owner and a declared person shown by their own declared display get none; with nobody declared a clean, non-clashing name leaves the block byte-identical to before (`tests/safe.injection.test.ts`, `tests/identity.recognise.test.ts`).

### REQ-discord-065

Roles on Discord (IDENTITY-8..12, ADMIN-3.b, #65). Each declared person
(REQ-discord-036) SHALL have exactly one role, read from `role = "team"` or
`role = "community"` in their `[people.<id>]` entry (JSON `role`), any case;
no `role` key reads as community; the configured owner's person is always
owner; `role = "owner"` on anyone else grants nothing (community, reported as
a problem naming the person id, never an account id); a list, an empty or an
unknown value makes the entry unreadable (skipped whole, fail closed).
`resolvePerson` returns `role` (`owner`, or the declared team / community) and
`roleOfPerson` the effective role (community for no role and for anyone
undeclared). `resolveDiscordActingRole` (`permissions.ts`) SHALL give a
Discord run's spawn role: `owner` when the caller resolves to ADMIN, `team`
when the owner's people list declares the caller's Discord id team and the
caller is not BLOCKED (muted / deny-listed), else `community`. The bridge
(chat and button-pick resume), `/session start` and `/work` SHALL pass it as
`AgentRunChatOpts.actingRole` (with `actingIsAdmin` = owner) and `/work` also
`workTask: true`; the spawn client SHALL always overwrite
`CORVIDINHO_ACTING_ROLE` (`owner` when `actingIsAdmin`, `team` only when the
caller passed team, else `community` — schedules pass none) and
`CORVIDINHO_ACTING_WORK_TASK` (`1` / `0`), never inheriting them. The tool
layer re-resolves the role on every call (REQ-plugins-065). `/admin people
role person:<id> role:<team|community>` (ADMIN-3.b) SHALL be the only chat
surface that sets a role: owner-only (dispatcher floor + handler re-check),
SAFE-5 `admin-people-role` rows (`started` before the atomic write, then
`ok`; `denied` for refusals; fail closed without a trail), writing only that
person's `role` key through the `/admin people` writer and its re-read safety
net; it SHALL refuse the owner role (owner is `[owner]` / env, IDENTITY-1),
an unknown role, an undeclared person and the owner's own person, and report
no change for the same role. `/admin people list` shows each person's role;
`config show` counts team and community. No chat or plugin path sets a role
(IDENTITY-8).

Acceptance Criteria
- `role = "team"` / `"community"` (any case, TOML and JSON) resolve; no role, undeclared ⇒ community; the owner ⇒ owner; `role = "owner"` elsewhere ⇒ community with a problem; a list or unknown value skips the entry.
- `resolveDiscordActingRole` gives owner, team and community, and community for a muted or deny-listed team member.
- The spawn env carries `CORVIDINHO_ACTING_ROLE` owner / team / community and `CORVIDINHO_ACTING_WORK_TASK`, overwriting a stale parent value; no role passed ⇒ community.
- Through `startBridge`, chat stamps each speaker's role and a file edit applies to the next message; `/work` stamps team + the work flag for a team member and reaches the PR step; `/session start` stamps the role without the work flag.
- `/admin people role` promotes and demotes with `admin-people-role` `started`/`ok` rows and a no-change reply for the same role; it refuses the owner role, unknown roles, undeclared people, the owner's person and a missing role (`denied`, file unchanged), a non-owner, and a missing audit trail; JSON files keep unread keys; `people list` shows roles and `config show` counts them.
- Regression tests in `tests/roles.team.test.ts` and `tests/discord.admin-slash.test.ts` fail on the base sources and pass after.

### REQ-discord-101

Memory scopes, the Discord inject and forget on request (MEMORY-5..7,
MEMORY-ACL-6, #101). A memory row's `owner_user_id` SHALL be its scope
(`src/memory/scope.ts`): the Discord user id for anyone not on the owner's
people list (and for the configured owner until declared under `[people]`),
as before; `person:<id>` for a declared person, matched on the acting
Discord id in the people list re-read now (stable ids only, IDENTITY-7), so
every Discord id linked to them reaches one profile (an id declared for two
people matches nobody and joins neither profile), and reads SHALL also
include rows stored under those Discord ids before they were declared (a key
in two scopes read once, newest first); `project:<key>` for a project,
keyed by the lowercased `owner/repo` of the checkout's `origin` remote
(credentials in the URL never kept), else the real path of the main checkout
(so every talk worktree shares it), else the folder's real path (only the
folder itself is examined for a repository). `MemoryStore.recall` SHALL
leave private notes (`private`) out unless `category` is `private` or
`includePrivate` is set.

The chat and button-pick inject (REQ-discord-023) SHALL recall the speaker's
subject (`memoryInjectOptsFor`: their declared person's scopes, else their
Discord id), never private notes and never anyone else's memory, and for an
owner or team speaker SHALL append a `[Corvidinho project memory …]` block
for the session's project (`sessionCwd` or the project root) when it holds
rows; community speakers never get it. Owner and team `/work` runs SHALL
start with that project block when it holds rows
(`enrichPromptWithProjectMemory`).

Forget on request (MEMORY-ACL-6): an ask recorded by `memory-forget-me`
(REQ-plugins-101) SHALL live in `forget_requests` (schema v12, forward-only
migration: id, subject kind and id, requester Discord id, origin
conversation ids, status `pending|approved|denied|expired`, created /
expires / card / decided / notified times, decider id, deleted-row count —
no free text, so nothing to scrub, SAFE-6; at most one pending ask per
subject). The bridge SHALL run one delivery pass (`createForgetCards`,
`src/discord/forget-card.ts`; never throws, one pass at a time) on every
scheduler tick (`SchedulerServiceOpts.onTick`, called at the start of each
tick, a throw logged) and after each chat message, and expose it as
`deliverForgetCards` on the started bridge. A pass SHALL: close every
pending ask past its expiry (24 h, `FORGET_REQUEST_TTL_MS`) as `expired`
and edit its card to say nothing was forgotten, buttons removed; DM the
configured owner (`GatewayHandlers.sendDm`, no mentions parsed) one
Approve/Deny card per undelivered pending ask, built with the reusable
helper `src/discord/approve-card.ts` (`cvok:<kind>:<approve|deny>:<id>`
custom ids; Approve danger, Deny grey; the text names who asked and where,
what Approve deletes with a stored-row count, what is kept, the request id and
when it lapses — never memory content), recording the card's DM channel and
message ids; and tell each asker whose ask was closed the outcome, by DM,
else in the conversation they asked in while it or its parent channel is
still allowlisted (mentioning only them), giving up after a day.

A press on a card SHALL be handled before the channel allowlist (it is the
owner's DM) and SHALL count only when the presser resolves ADMIN now (the
configured owner, not muted, not deny-listed); anyone else gets an ephemeral
refusal and a `denied` audit row. A closed ask SHALL answer "already
closed"; a press at or after expiry SHALL close it `expired` and delete
nothing (a late answer is no). Deny SHALL close it `denied` (audited),
delete nothing, answer the press, then tell the asker. Approve SHALL append the SAFE-5
`memory-forget-approve` `started` row first and, when it cannot be
written, refuse and leave the ask pending; then, in one IMMEDIATE transaction,
compare-and-set the ask to `approved` and delete for good every memory row
of the recorded subject — `person:<id>` and the Discord ids linked to that
person now plus the asker's id, or the undeclared asker's id; active,
soft-deleted and private rows — and the stored turns of those Discord ids'
sessions; then append `ok` (or `error`, the ask left pending, on a
failure), drop the session threads the running bridge holds for those
Discord ids (`SessionStore.forgetTurnsOfUsers`, so no later run replays
them), answer the press by updating the card with the counts and no
buttons, and then tell the asker. After a Deny or an Approve the card SHALL
be edited once more to say whether the asker was told (the press is answered
before any DM, within Discord's interaction window). The people list entry
and project memory SHALL NOT be touched. Audit rows hold the request id
digest and outcome only.

Acceptance Criteria
- A declared person's store lands in `person:<id>`, each linked Discord id recalls it, rows under their Discord ids from before still read once; an undeclared user keeps the Discord-id scope.
- The chat inject holds the speaker's own profile only, never private notes; owner / team get the project block (also in `/work`), community never.
- `projectKeyFor` gives `owner/repo` without credentials for a checkout and its worktree, the main checkout path without an origin, the folder path for a plain folder.
- A delivery pass DMs the owner one card per pending ask (count, no content), expires unanswered asks (card closed, asker told) and tells deciders' askers by DM or in their allowlisted conversation.
- Only the owner's press counts; Approve deletes every memory row and session turn of that person, stored and held by the running bridge (not others', not project memory, not the people list), writes `started` then `ok`, answers the press first, then tells the asker and marks the card; a keyed chain with no key refuses Approve and deletes nothing.
- Deny and a late press delete nothing and tell the asker; a second press finds the ask closed.
- A v11 DB migrates to v12 keeping its data; `forget_requests` has no free-text column and one pending ask per subject; re-running is a no-op.
- `tests/discord.forget-card.test.ts` and `tests/memory.profiles.test.ts` cover each and fail on the stacked base sources.
### REQ-discord-680

The Discord bridge's scheduler tick SHALL run the nightly backup and restore
test of REQ-cli-680 (`createBackupTicker` over the bridge's shared DB, passed
to `SchedulerService` as `backup`; `SchedulerService.tick` SHALL call it with
its clock after the due runs are claimed, never throwing). It SHALL log each
run as one scrubbed `[backup] <event> {json}` console line.

OPS-1 "I'm told if it fails": on each tick the bridge SHALL deliver pending
backup / restore-test owner notices (recorded by its own tick or by a daemon
on the same data dir): claim one (compare-and-delete in `schema_meta`), post
it to the `/announce` channel (DISCORD-ANNOUNCE) as fixed text
(`formatBackupNotice`: `⚠️ The nightly backup failed (<UTC time>)…` or
`⚠️ The restore test failed (<UTC time>)…`, pointing at `corvidinho doctor`
on the host, tagged OPS-1 / OPS-2) — prefixed with the owner mention and with allowed mentions
limited to the owner (REQ-discord-205), never a host path or the error text.
A post that does not go out (no announcements channel, no gateway, Discord
refused it) SHALL hand the notice back for the next tick and log
`…owner_not_told` once; with no announcements channel nothing is posted
anywhere else. One notice per failure streak (REQ-cli-680). `schedulerNow`
is a test seam for the scheduler and backup clock.

Acceptance Criteria
- A bridge whose backup dir is a file, with an announcements channel and an owner, posts exactly one reply to that channel over many ticks: it starts with `<@owner> ⚠️ The nightly backup failed`, `mentionUserIds` is [owner], it holds no host path; the notice is cleared and the failure streak recorded.
- Without an announcements channel no reply is posted and the notice stays pending.
- A good backup dir gets tonight's snapshot from the bridge tick and nobody is pinged.
- `SchedulerService.tick` hands its clock to the backup ticker on every tick.

### REQ-discord-071

Untrusted text on Discord (SAFE-11 / SAFE-12 / SAFE-13, #71). The IDENTITY-4
acting-user block SHALL show the acting user's Discord display name or
username only after `cleanDisplayName` (`cleanedDiscordName`; the declared
person's display and the owner map display are the owner's own and shown as
configured), and SHALL add one `name_clash` line when that shown Discord name
reads like the owner's display or another declared person's display or
nickname (`displayNameClash`, `namesLookAlike`); who the user is and their
role come only from the Discord user id (IDENTITY-7 / IDENTITY-12). Chat
messages, `/session start` and `/work` SHALL resolve the speaker's role
(`resolveDiscordActingRole`) before the run. For team and community speakers
(never the owner) `inboundInjection` SHALL scan the speaker's own words; a hit
SHALL start no run: on chat one public reply to the message
(`formatInjectionRefusal`: what it won't do and why in plain words, never the
text, pinging the owner with allowed mentions limited to the owner; without an
owner it says nobody could be told and logs `INJECTION_NO_OWNER_WARNING`), a
session the message started is ended and the turn is not recorded; on slash
(`refuseInjectedSlash`) the interaction gets the public refusal and the owner a
fresh channel post that pings only them, and no session, worktree or work task
is created; either way one `injection-suspected` / `denied` SAFE-5 row is
appended through the bridge's trail (actor, surface `discord:<session>` or
`discord:/<command>`, digest of the source and reason ids; best effort).
Otherwise a team / community speaker's words SHALL reach the model through
`fenceSpeakerText` (the `UNTRUSTED_DATA` fence with a header naming their role
and saying it is their request but data, not instructions); the owner's words
are unchanged. The spawn client SHALL read the child's `result.injection`
with `injectionNoticeFromUnknown` into `AgentSpawnResult.injection`, and the
post that carries a run's answer SHALL then ping the owner with
`formatInjectionOwnerLine`: chat and button-pick replies (`withInjectionNotice`,
with the SAFE-8 warning), `/session start` and `/work` (`slashOwnerNotice`
`injection`) and a schedule run's result post or ask post. Replayed session
turns SHALL strip invisible characters and mark a line that imitates a
Corvidinho block or a turn label (`Human:`, `You (Corvidinho):`) `(quoted)`,
so an earlier message cannot close the replay block or pass for a turn of
Corvidinho's own; recalled
memory lines SHALL strip invisible characters. `discord-user-lookup` names are
cleaned (REQ-plugins-071). No env var, config key, table or column.

Acceptance Criteria
- Through `startBridge` with a memory DB: a stranger's injection starts no run, gets one reply to the message that pings only the owner, ends the session it started and appends one `injection-suspected` / `denied` row with the stranger as actor; a declared team member's injection is refused too; the owner's own words run unfenced.
- An ordinary stranger message runs with the words inside the fence (`role: community`, `source=chat-message`), the display name cleaned and a `name_clash` line; a run reporting `injection` gets the owner line and the owner in its allowed mentions.
- `/session start` and `/work`: a stranger's injection creates no session and runs nothing, the interaction gets the refusal, the owner a fresh ping post, the trail one `denied` row; an ordinary stranger request runs fenced and the owner's unfenced.
- `slashOwnerNotice` and `withInjectionNotice` carry the SAFE-13 owner line and the owner mention; no notice leaves a post unchanged.
- The replay block marks a turn line that imitates its footer or a turn label `(quoted)` and still ends with its own footer.
- A schedule run reporting `injection` pings the owner with the SAFE-13 line on its result post and, when it ends with an ask, on its ask post.
- A non-owner's free-text answer to a pending ask reaches the model inside the fence (`tests/discord.slash-pending-ask.test.ts`).
- Regression tests in `tests/safe.injection.test.ts` fail on the base sources and pass after.

### REQ-discord-067

Ranked recall and a memory search for each message (MEMORY-9, #67), and the
GitHub memory subject (MEMORY-8). `MemoryStore.recall` with a `query` SHALL
be a search: its terms (`recallTerms`: lowercased letters/digits, words of
two or more characters, common question words and pronouns dropped, a light
English stem, at most 24) and the whole query are matched in keys and content
(case-insensitive), at most 500 newest candidates are read, a key read in two
scopes is kept once (newest), and rows are ranked (`rankMemories`) by
relevance — each term weighted by its inverse frequency among the
candidates, a key hit counting double, the whole query adding a bonus — times
a recency weight (30-day half-life, never below 3/4), newer first on ties.
A query with no terms SHALL match as one substring, newest first, as before.
Private notes stay out unless asked (MEMORY-7). No FTS table and no schema
change.

The chat and button-pick inject (REQ-discord-023 / REQ-discord-101) SHALL
search memory for the human's message (the picked label on a button):
`recallRelevantThenRecent` — the rows relevant to it first, then the newest to
fill, at most 20 — for the speaker's block and for the owner / team project
block; the owner's and team's `/work` project block (REQ-discord-101) SHALL
likewise be searched for the work description
(`enrichPromptWithProjectMemory(…, limit, query)`). Without a query the
blocks are the newest rows, as before.

`memorySubjectForGithub(dir, { login, id })` SHALL resolve a GitHub
commenter to their declared person's subject (the same scopes as on Discord;
the configured owner not declared under `[people]` to their Discord-id
subject; undeclared or ambiguous ⇒ null), and `projectScopeForRepo(repo)`
SHALL give `project:<owner/repo>` lowercased for a valid `owner/repo` (else
null). The Discord agent spawn SHALL always clear
`CORVIDINHO_ACTING_GITHUB_LOGIN` / `_ID` / `_REPO`, so a Discord or
scheduled run never acts for a GitHub commenter.

Acceptance Criteria
- A question in plain words finds the fact it is about; a key hit outranks a newer passing mention; equal relevance goes to the newer row; a question-words-only query matches as one substring.
- A multi-scope search keeps the newest of a key once and leaves private notes out.
- The Discord inject holds an older fact the message is about although newer rows fill the block; an owner's `/work` run holds an older project fact its description is about although newer rows fill the block.
- `memorySubjectForGithub` matches by numeric id or login, refuses a login whose numeric id differs, and maps the undeclared-under-`[people]` owner to their Discord id; `projectScopeForRepo` accepts only `owner/repo`.
- A Discord spawn clears inherited GitHub commenter keys.
- `tests/memory.recall-github.test.ts` and `tests/memory.rank.test.ts` cover each and fail on the stacked base sources.

