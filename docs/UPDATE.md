# Updating Corvidinho on the bot box

Ship cuts are **GitHub Releases** on tags `v*` (see [Releases](https://github.com/CorvidLabs/Corvidinho/releases)). Pushing a tag runs `.github/workflows/release.yml`, which creates the release (idempotent if it already exists).

## Safe update script

From the clone on the VM:

```bash
# Optional: point at a release tag (default CORVIDINHO_REF=main)
export CORVIDINHO_REF=v0.0.3

# Secrets + allowlists stay in the env file — never commit real values.
# Copy shape from .env.example; typical path:
#   ~/.config/corvidinho/env
export CORVIDINHO_ENV_FILE=~/.config/corvidinho/env

./scripts/corvidinho-update.sh
```

What it does:

1. `git fetch` + record previous SHA  
2. Checkout `CORVIDINHO_REF` (tag or branch)  
3. `bun install`  
4. Optional `bun src/cli.ts doctor` when `CORVIDINHO_RUN_DOCTOR=1`  
5. Stop Discord bridge via pidfile `/tmp/corvidinho-discord-bridge.pid`  
6. Start `bun src/cli.ts discord bridge` with env from `CORVIDINHO_ENV_FILE` (no secrets in the script)  
7. Wait for `[discord] logged in` or `protocol version … OK` in the bridge log  
8. On timeout/failure: **rollback to previous SHA**, reinstall, restart — **log only** (never posts panic messages to Discord)

Dry run / tree-only:

```bash
CORVIDINHO_DRY_RUN=1 ./scripts/corvidinho-update.sh
CORVIDINHO_SKIP_START=1 CORVIDINHO_REF=v0.0.3 ./scripts/corvidinho-update.sh
```

## Secrets pattern (do not hardcode)

| Variable | Where |
|----------|--------|
| `DISCORD_TOKEN` / `DISCORD_BOT_TOKEN` | `~/.config/corvidinho/env` or systemd `EnvironmentFile` |
| Channel allowlists | same env file and/or `~/.config/corvidinho/allowlist.toml` |
| Optional LLM / GitHub | same — see `.env.example` and `docs/DISCORD-GO-LIVE.md` |

Never paste tokens into chat, commits, or the update script.

## Manual fallback

```bash
cd /path/to/Corvidinho
git fetch --tags
git checkout v0.0.3   # or: git reset --hard origin/main
bun install
# restart bridge with the same env as before
```

Sessions are in-memory — any restart clears them.
