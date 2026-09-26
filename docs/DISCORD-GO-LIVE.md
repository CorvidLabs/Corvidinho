# Discord HEAR go-live (Developer Portal + VM)

Corvidinho owns config/setup end-to-end for issue #5. **Secrets never go in the repo or chat.**
When the bridge is **READY-FOR-SECRETS** (code merged + checklist below ready), CoS/Leif provide the token via the secure secret-request room — never paste tokens into Discord/GitHub/chat.

## A. Discord Developer Portal

1. Open [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** (name e.g. Corvidinho).
2. **Bot** tab → Add Bot → Reset Token → copy token into the VM secret store only (`DISCORD_TOKEN` or `DISCORD_BOT_TOKEN`). Do not commit.
3. **Privileged Gateway Intents:** enable **Message Content Intent** (required for mention text). Enable Server Members Intent only if you later need role gates beyond channel allowlists.
4. **OAuth2 → URL Generator:** scopes `bot`; bot permissions at least `View Channels`, `Send Messages`, `Read Message History`, `Create Public Threads` (optional for 2.a). Generate invite URL → add bot to the target guild.
5. In Discord: User Settings → Advanced → **Developer Mode** ON → right-click channel → **Copy Channel ID**. Those snowflakes go in `DISCORD_CHANNEL_IDS` / allowlist `[discord].channels` (non-empty required).

## B. Bot VM paths

```bash
mkdir -p ~/.config/corvidinho
cp allowlist.example.toml ~/.config/corvidinho/allowlist.toml
# edit channels = ["YOUR_CHANNEL_ID"]  — empty = refuse start

# Env (secret store / systemd EnvironmentFile — never git):
# DISCORD_TOKEN=…
# DISCORD_CHANNEL_IDS=…          # or rely on allowlist file / CORVIDINHO_DISCORD_ALLOW_CHANNELS
# optional: CORVIDINHO_DISCORD_ALLOW_USERS / _ROLES  (empty = deny-all when checked)
# optional: CORVIDINHO_ALLOWLIST_FILE=/path/to/allowlist.toml
# optional DISCORD-6: DISCORD_RATE_LIMIT_WINDOW_MS=60000 DISCORD_RATE_LIMIT_MAX=10
# optional DISCORD-6 mute seed: DISCORD_MUTED_USER_IDS=
```

Repo templates (no secrets):

- [`.env.example`](../.env.example)
- [`allowlist.example.toml`](../allowlist.example.toml)

## C. Verify before asking for secrets

```bash
bun src/cli.ts doctor          # Discord gate: token + non-empty channels
bun src/cli.ts --protocol-version
# Without token: discord bridge must exit cleanly with checklist (no crash)
bun src/cli.ts discord bridge
```

When doctor/bridge are green **except** missing real token, status is **READY-FOR-SECRETS** — then ping CoS/Leif via the secure room for the token + confirm channel IDs.

## D. Run

```bash
corvidinho discord bridge
# or: CORVIDINHO_DISCORD_DRY_RUN=1 corvidinho discord bridge   # no live connect
```

Soft later (out of scope for #5 thin): issues #13–#14 (rate/mute #12 shipped separately).
