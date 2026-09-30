# BOX-UPDATE — safe Corvidinho pull / restart

Linux bot VM helper. Prefer this over ad-hoc `git pull` so a bad tip does not leave
the Discord bridge half-dead and does **not** spam Discord on failure.

## Quick start

```bash
cd /path/to/Corvidinho
# Update to latest main:
./scripts/corvidinho-update.sh

# Pin a release tag (every package version from 0.0.2 has one —
# list them with `git ls-remote --tags origin`):
CORVIDINHO_REF=vX.Y.Z ./scripts/corvidinho-update.sh

# Plan only (still runs `git fetch --tags --prune origin`; no checkout/install/doctor/restart):
CORVIDINHO_UPDATE_DRY_RUN=1 ./scripts/corvidinho-update.sh
```

## What it does

1. `git fetch --tags --prune origin`
2. Record current `HEAD` (rollback target)
3. `git checkout --force` the requested ref (default `origin/main`; `CORVIDINHO_REF`)
4. `bun install` (frozen lockfile, then fallback)
5. `bun src/cli.ts doctor` (refuse to restart if doctor fails → rollback)
6. Restart the bridge (pidfile mode unless a unit or command is configured; see below)
7. On failure after checkout (install, doctor, or the restarted bridge not ready — see below): force-checkout previous SHA + reinstall; **exit 1** with log lines only (no Discord notify)

The updater sources `CORVIDINHO_ENV_FILE` once — after `bun install`, before `doctor` — so
`doctor`, every restart path (pidfile, systemd, command) and a rollback restart all see the
same env. A systemd unit's bridge still takes its env from the unit's own `EnvironmentFile=`,
not from the updater (`systemctl` does not pass the caller's env on), so keep the two in step.
Every doctor check must pass there — `discord`, `github`, `github-watch`, `fledge`,
`specsync`, `plugins`, `data-dir`, the checkout's project files (`fledge.toml`, a
`verify-lane` that runs spec-check, `.specsync`, `specs`), and `allowlist-file` when an
allowlist file exists (a file the loader cannot parse fails it) — or the update rolls back. `discord` and `github-watch`
read the allowlist file and env like the bridge and watch (deny wins); `[warn]` / `[info]`
lines (for example `llm` without a key, or `backup` when `CORVIDINHO_BACKUP_DIR` is unset,
unusable or its last nightly backup / restore test failed) do not fail doctor. The `github-watch` check needs
`GITHUB_TOKEN`/`GH_TOKEN` and `CORVIDINHO_WATCH_USERNAME` in the env plus at least one usable
allowed repo or org (allowlist file `[github]` or `CORVIDINHO_GITHUB_ALLOW_REPOS`/`_ORGS`),
even on a box that does not run WATCH. If the env file is missing, the updater's own
environment is used; set `CORVIDINHO_SKIP_DOCTOR=1` only knowingly.

Bun also auto-loads a `.env` file from the checkout root into processes started there (`doctor`
and a pidfile-mode bridge); spawned agents never read it (`bun --no-env-file`). Keep secrets in
the env file above rather than a `.env` in the checkout.

## Restart configuration

The script picks one restart mode:

1. **pidfile** when `CORVIDINHO_USE_PIDFILE=1`; otherwise, if `CORVIDINHO_BRIDGE_UNIT` is not
   set, when the pidfile already exists or `CORVIDINHO_BRIDGE_CMD` is not set. It stops the pid
   (SIGTERM, then SIGKILL), starts
   `bun <CORVIDINHO_BIN or src/cli.ts> discord bridge` with `nohup`, and waits for
   `[discord] logged in as <bot tag>` in the log. The bridge prints that line only once
   Discord login succeeds (ClientReady). `[discord] protocol version N OK` comes earlier,
   before login, and does **not** count: a bridge with a bad `DISCORD_TOKEN` prints it and
   then exits. If the bridge exits, or no login line shows up within
   `CORVIDINHO_READY_TIMEOUT`, the update rolls back (exit 1, log lines only).
2. **systemd** — `systemctl restart $CORVIDINHO_BRIDGE_UNIT`, then checks the unit is active
   (`systemctl is-active`; the updater does not read the bridge log in this mode).
   A set unit wins over a leftover pidfile (no second `nohup` bridge next to the unit's): a
   stale pidfile is removed; one naming a live pid is left alone with a log line. If that pid
   is a second bridge an earlier update started next to the unit's, stop it by hand
   (`kill <pid>`) and remove the pidfile.
3. **command** — runs `CORVIDINHO_BRIDGE_CMD` in `bash -lc`, passing the command text through
   the environment (not the shell's argv), so a `pkill -f` pattern in it cannot match that shell.

| Env | Purpose |
|-----|---------|
| `CORVIDINHO_BRIDGE_UNIT` | systemd unit to `systemctl restart` (e.g. `corvidinho-bridge`) |
| `CORVIDINHO_BRIDGE_CMD` | shell command used when no unit (e.g. `pkill -f '^[^ ]*bun [^ ]*cli\.ts discord bridge' \|\| true; nohup bun src/cli.ts discord bridge &` — the anchored pattern matches only the bridge process, never a shell whose command line holds this text) |
| `CORVIDINHO_USE_PIDFILE=1` | force pidfile mode |
| `CORVIDINHO_PIDFILE` | pidfile path (default `/tmp/corvidinho-discord-bridge.pid`) |
| `CORVIDINHO_BRIDGE_LOG` | bridge log in pidfile mode (default `/tmp/corvidinho-discord-bridge.log`) |
| `CORVIDINHO_READY_TIMEOUT` | pidfile mode: seconds to wait for `[discord] logged in as …` before rolling back (default 60) |
| `CORVIDINHO_ENV_FILE` | secrets env sourced once before doctor, for doctor, restart and rollback (default `~/.config/corvidinho/env`) |
| `CORVIDINHO_ROOT` | repo root (default: the checkout holding the script) |
| `CORVIDINHO_SKIP_RESTART=1` | update code only |
| `CORVIDINHO_SKIP_DOCTOR=1` | skip doctor (not recommended) |

Secrets (`DISCORD_TOKEN`, LLM keys, allowlists) stay in the VM env/secret store —
the script never prints them.

**The script restarts only the bridge.** Restart `github watch` and `corvidinho daemon`
yourself after every update (for example `sudo systemctl restart corvidinho-daemon`): each
process spawns `task run` from the updated checkout, and the wire protocol must match
(DISCORD-10; see [`DISCORD-GO-LIVE.md`](DISCORD-GO-LIVE.md) E.2).

## After update

- Sessions/work stubs **and memories** persist in local SQLite under `~/.local/share/corvidinho/` (override `CORVIDINHO_DATA_DIR`); soft TTL ~45m (30–60m via `CORVIDINHO_SESSION_TTL_MS`). Restart no longer wipes active maps within TTL. Sessions, schedules, memories, forget requests, WATCH sessions, kept conversation summaries (30 days, `conversation_threads`), Approve/Deny card requests and one-time codes (`approval_requests`, `approval_codes`) and the audit chain share `corvidinho.db` (schema v14 — v12 forget requests, v13 kept conversations, v14 Approve/Deny cards and one-time codes; forward-only: an older build keeps working on it but does not know the newer tables); the DB migrates on first open after an update. Forget/override of memories (own or other) requires ADMIN — the configured owner — at handler time; no owner = nobody (IDENTITY-3). Anyone may ask to be forgotten; it happens only once the owner presses Approve on the DM card the bridge sends and types back the one-time code it then DMs (SAFE-18/19), and it also deletes their kept conversations (MEMORY-ACL-6, [`discord.md`](discord.md) Memory). Bridge restart picks up package presence version after update.
- Confirm with Discord `/status` (ephemeral): version, uptime, protocol, channels, sessions, work, LLM line, slash names, announce channel, owner configured, audit chain, 24 h spend vs cap (owner only; others see only "Work is paused for budget." while paused), git tip.
- Operator knobs (owner, `CORVIDINHO_ALLOWLIST`, autonomous gate, logs): [`DISCORD-GO-LIVE.md`](DISCORD-GO-LIVE.md) section E.

## Releases

`.github/workflows/release.yml` gives every package version a `v<version>` tag and a GitHub
Release with verbose notes (the version's CHANGELOG section, commits since the previous tag,
the updater line). When a `package.json` version bump lands on main it tags the commit that
bumped it, catching up any earlier version that has no tag yet (oldest first); a hand-pushed
`vX.Y.Z` tag (annotated or lightweight) still gets its Release; a manual run on main
(`workflow_dispatch`, input `versions`) tags and releases the listed versions. Existing tags
and Releases are never moved or edited. GitHub starts no run when more than three tags are
pushed at once, so use the manual run for bulk tags.

## Discord slash ghosts / duplicates

If Discord shows outdated or duplicated slash commands (e.g. two `/agents`),
the API likely still has **stale guild** commands from an older bot plus
**globals** from Corvidinho. Guild PUT never clears globals.

1. Set `DISCORD_GUILD_ID` to the dogfood guild snowflake (channel → Copy Server ID).
2. Re-register (does not need a full LLM restart if only fixing commands):

```bash
cd /path/to/Corvidinho   # or Corvidinho-run checkout
export DISCORD_GUILD_ID=...   # do not echo the token
bun src/cli.ts discord register-commands
# or restart the bridge so ClientReady re-registers:
# pkill -f '^[^ ]*bun [^ ]*cli\.ts discord bridge' || true; nohup bun src/cli.ts discord bridge &
```

3. Confirm with Discord API (source of truth): guild commands = the current slash set, nine
   commands (`session`, `status`, `agents`, `work`, `mute`, `unmute`, `schedule`, `announce`,
   `admin`); globals = empty.
4. Discord **client cache** can lag — leave/rejoin the server or wait a minute
   if the UI still shows ghosts after the API is clean.

