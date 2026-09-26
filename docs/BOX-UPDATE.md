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

- Sessions are **in-memory**; restart clears them (durable session DB is a separate ask).
- Confirm with Discord `/status` (ephemeral): version, uptime, LLM mode, git tip.

## Releases

Pushing an annotated tag `v*` runs `.github/workflows/release.yml`, which opens a
GitHub Release with verbose notes (commits since previous tag + upgrade pointer).
