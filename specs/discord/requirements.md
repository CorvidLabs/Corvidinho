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
- `corvidinho --protocol-version` prints `1`.
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

The bridge SHALL register and dispatch thin slash commands `/session`,
`/status`, `/agents`, `/work`, `/mute`, and `/unmute` so operators can manage
sessions, see agents, check status, and drive work tasks without leaving
Discord (DISCORD-4 / DISCORD-7). Handlers SHALL re-check the channel allowlist
at run time (DISCORD-5 / DISCORD-7 light). Session start and work SHALL use
SessionStore + in-memory work stubs + AgentClient. Registration SHALL use the
overwrite path in REQ-discord-016 (guild PUT of exactly these six, clear
globals when guild-scoped). The bridge SHALL NOT introduce ProcessManager,
invent additional slash commands, or weaken allowlists. Fixture tests SHALL
cover dispatch and handlers without a live Discord token.

Acceptance Criteria
- Command bodies include session (list/start), status, agents, work, mute, unmute (exactly these six).
- Non-allowlisted channel slash → not authorized; no session/work created.
- `/session list` reflects SessionStore; `/session start` creates stub + agent run.
- `/status` reports shared package version/uptime/sessions/work/channels/protocol plus dogfood lines (see REQ-discord-015).
- `/agents` lists local Corvidinho agent; `/work` creates work stub + agent run.
- No ProcessManager; secrets out of repo; default-deny allowlists unchanged.

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
`task run --json` stdout is present, the Discord chat reply SHALL surface a
parsed summary (state / verified / attempts + `result.summary`) rather than
dumping raw JSON. Prefer `--no-verify` for bridge latency. Fixture tests SHALL
cover argv shape and JSON summary parsing without a live Discord token.

Acceptance Criteria
- `.ts` bin → `["bun", bin, "task", "run", ...]`; non-`.ts` → `[bin, ...]`.
- Valid `--json` stdout → Discord body includes state and summary text.
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

Slash command registration SHALL full-overwrite the target scope with
`buildSlashCommandBodies()` (exactly the six DISCORD-4 commands) via Discord
REST PUT. When `DISCORD_GUILD_ID` (or equivalent guild id) is set, the system
SHALL PUT `Routes.applicationGuildCommands(appId, guildId)` with the six
bodies, then PUT `Routes.applicationCommands(appId)` with body `[]` to clear
stale globals (guild PUT never clears globals). The system SHALL NOT register
the same command names both global and guild in one registration path. When
guild id is unset, the system MAY PUT globals to the six bodies and SHALL warn
that stale guild commands are not cleared. Fixture tests SHALL cover
guild-then-clear-globals put order without a live Discord token. Steal
PUT+clear-globals only — do NOT port archive full `buildCommands()` lists.

Acceptance Criteria
- Guild id set → put order: guild bodies (len 6), then global `[]`.
- Guild id unset → global bodies (len 6); `clearedGlobals` false / warn.
- Bodies names exactly session, status, agents, work, mute, unmute.
- No dual global+guild registration of the same names in one path.
- No ProcessManager; secrets out of repo; no new slash names.


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
