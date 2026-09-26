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
3. `git checkout` the requested ref
4. `bun install` (frozen lockfile, then fallback)
5. `bun src/cli.ts doctor` (refuse to restart if doctor fails → rollback)
6. Restart bridge if configured (see below)
7. On failure after checkout: force-checkout previous SHA + reinstall; **exit 1** with log lines only (no Discord notify)

## Restart configuration

| Env | Purpose |
|-----|---------|
| `CORVIDINHO_BRIDGE_UNIT` | systemd unit to `systemctl restart` (e.g. `corvidinho-bridge`) |
| `CORVIDINHO_BRIDGE_CMD` | shell command used when no unit (e.g. `pkill -f 'discord bridge' \|\| true; nohup bun src/cli.ts discord bridge &`) |
| `CORVIDINHO_SKIP_RESTART=1` | update code only |
| `CORVIDINHO_SKIP_DOCTOR=1` | skip doctor (not recommended) |

Secrets (`DISCORD_TOKEN`, LLM keys, allowlists) stay in the VM env/secret store —
the script never prints them.

## After update

- Sessions/work stubs persist in local SQLite under `~/.local/share/corvidinho/` (override `CORVIDINHO_DATA_DIR`); soft TTL ~45m (30–60m via `CORVIDINHO_SESSION_TTL_MS`). Restart no longer wipes active maps within TTL. MEMORY ACL / schedules still separate.
- Confirm with Discord `/status` (ephemeral): version, uptime, LLM mode, git tip.

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
# pkill -f 'discord bridge' || true; nohup bun src/cli.ts discord bridge &
```

3. Confirm with Discord API (source of truth): guild commands = the current slash set (seven including /schedule)
   (`session`, `status`, `agents`, `work`, `mute`, `unmute`); globals = empty.
4. Discord **client cache** can lag — leave/rejoin the server or wait a minute
   if the UI still shows ghosts after the API is clean.

