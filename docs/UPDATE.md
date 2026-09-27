# Updating Corvidinho

Ship cuts are **GitHub Releases** on tags `v*` — see [Releases](https://github.com/CorvidLabs/Corvidinho/releases). `.github/workflows/release.yml` tags every package version when its `package.json` bump lands on main and creates the Release (it catches up any earlier untagged version; a hand-pushed `vX.Y.Z` tag still works; existing tags and Releases are never moved). Versions 0.0.2 onward are tagged.

## Prefer the safe updater

```bash
cd /path/to/Corvidinho
CORVIDINHO_REF=vX.Y.Z ./scripts/corvidinho-update.sh   # a pushed tag: git ls-remote --tags origin
```

Full operator notes (systemd / `BRIDGE_CMD`, dry-run, doctor): **[`docs/BOX-UPDATE.md`](BOX-UPDATE.md)**.

### Pidfile + ready wait (default when no systemd unit)

- Stop/start via `/tmp/corvidinho-discord-bridge.pid`
- Log: `/tmp/corvidinho-discord-bridge.log`
- Success requires the bridge's Discord login line `[discord] logged in as …` within `CORVIDINHO_READY_TIMEOUT` (default 60s); the earlier `protocol version … OK` line is printed before login and does not count
- On failure: rollback to previous SHA + restart — **log only** (never Discord panic posts)
- Secrets: source `~/.config/corvidinho/env` (`CORVIDINHO_ENV_FILE`) — never hardcode; see `.env.example`
- `corvidinho doctor` must pass after install or the update rolls back — including the `allowlist-file` check: an allowlist file the loader cannot parse fails it (and would stop the bridge, `github watch` and `daemon` from starting)
- The updater restarts **only the bridge**. Restart `github watch` and `corvidinho daemon` yourself (protocol lockstep, [`DISCORD-GO-LIVE.md`](DISCORD-GO-LIVE.md) E.2)
