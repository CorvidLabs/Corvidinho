# BOX-UPDATE — safe Corvidinho pull / restart

Linux bot VM helper. Prefer this over ad-hoc `git pull` so a bad tip does not leave
the Discord bridge half-dead and does **not** spam Discord on failure.

## Quick start

```bash
cd /path/to/Corvidinho
# Update to latest main:
./scripts/corvidinho-update.sh

# Pin a release tag:
CORVIDINHO_REF=v0.0.2 ./scripts/corvidinho-update.sh

# Plan only:
CORVIDINHO_UPDATE_DRY_RUN=1 ./scripts/corvidinho-update.sh
```

## What it does

1. `git fetch --tags`
2. Record current `HEAD` (rollback target)
3. `git checkout` the requested ref (default `origin/main`; `CORVIDINHO_REF`)
4. `bun install` (frozen lockfile, then fallback)
5. `bun src/cli.ts doctor` (refuse to restart if doctor fails → rollback)
6. Restart the bridge (pidfile mode unless a unit or command is configured; see below)
7. On failure after checkout: force-checkout previous SHA + reinstall; **exit 1** with log lines only (no Discord notify)

The updater sources `CORVIDINHO_ENV_FILE` once — after `bun install`, before `doctor` — so
`doctor`, every restart path (pidfile, systemd, command) and a rollback restart all see the
same env. Every doctor
check must pass there — `discord`, `github`, `github-watch`, `fledge`, `specsync`, `plugins` —
or the update rolls back. If the env file is missing, the updater's own environment is used;
set `CORVIDINHO_SKIP_DOCTOR=1` only knowingly.

## Restart configuration

The script picks one restart mode:

1. **pidfile** when `CORVIDINHO_USE_PIDFILE=1`; otherwise, if `CORVIDINHO_BRIDGE_UNIT` is not
   set, when the pidfile already exists or `CORVIDINHO_BRIDGE_CMD` is not set. It stops the pid
   (SIGTERM, then SIGKILL), starts
   `bun <CORVIDINHO_BIN or src/cli.ts> discord bridge` with `nohup`, and waits for
   `[discord] logged in` or `protocol version N OK` in the log.
2. **systemd** — `systemctl restart $CORVIDINHO_BRIDGE_UNIT`, then checks the unit is active.
   A set unit wins over a leftover pidfile (no second `nohup` bridge next to the unit's): a
   stale pidfile is removed; one naming a live pid is left alone with a log line.
3. **command** — runs `CORVIDINHO_BRIDGE_CMD` in `bash -lc`, passing the command text through
   the environment (not the shell's argv), so a `pkill -f` pattern in it cannot match that shell.

| Env | Purpose |
|-----|---------|
| `CORVIDINHO_BRIDGE_UNIT` | systemd unit to `systemctl restart` (e.g. `corvidinho-bridge`) |
| `CORVIDINHO_BRIDGE_CMD` | shell command used when no unit (e.g. `pkill -f '^[^ ]*bun [^ ]*cli\.ts discord bridge' \|\| true; nohup bun src/cli.ts discord bridge &` — the anchored pattern matches only the bridge process, never a shell whose command line holds this text) |
| `CORVIDINHO_USE_PIDFILE=1` | force pidfile mode |
| `CORVIDINHO_PIDFILE` | pidfile path (default `/tmp/corvidinho-discord-bridge.pid`) |
| `CORVIDINHO_BRIDGE_LOG` | bridge log in pidfile mode (default `/tmp/corvidinho-discord-bridge.log`) |
| `CORVIDINHO_READY_TIMEOUT` | seconds to wait for the ready line (default 60) |
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

- Sessions/work stubs **and memories** persist in local SQLite under `~/.local/share/corvidinho/` (override `CORVIDINHO_DATA_DIR`); soft TTL ~45m (30–60m via `CORVIDINHO_SESSION_TTL_MS`). Restart no longer wipes active maps within TTL. Sessions, schedules, memories, WATCH sessions and the audit chain share `corvidinho.db` (schema v7); the DB migrates on first open after an update. Forget/override of memories (own or other) requires ADMIN — the configured owner — at handler time; no owner = nobody (IDENTITY-3). Bridge restart picks up package presence version after update.
- Confirm with Discord `/status` (ephemeral): version, uptime, protocol, channels, sessions, work, LLM line, slash names, announce channel, owner configured, audit chain, git tip.
- Operator knobs (owner, `CORVIDINHO_ALLOWLIST`, autonomous gate, logs): [`DISCORD-GO-LIVE.md`](DISCORD-GO-LIVE.md) section E.

## Releases

Pushing an annotated tag `v*` runs `.github/workflows/release.yml`, which opens a
GitHub Release with verbose notes (commits since previous tag + upgrade pointer).

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

