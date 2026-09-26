# STATUS — Corvidinho

**As of:** 2026-09-26 (America/Denver)

| Item | State |
|------|--------|
| Repo | Bootstrap / HI capture + default-deny allowlists |
| Default product | Linux-first Bun/TS agent runner (CLI stub) |
| HI | Captured under `hi/` (11 families incl. ALLOW/WALLET) — see `hi check` |
| Allowlists | **Default-deny** (empty = refuse). File + env on bot VM. See below. |
| Fledge | `fledge.toml` with `smoke` + `verify` (includes `spec-check` note/task) |
| SpecSync | Minimal `.specsync/` + `specs/cli/` + `specs/plugins/`; SDD change workflow **ON** |
| Trust / Augur / Attest | **Not** wired — do not re-add Trust thrash on this bootstrap |
| Merge policy | Merge when verify + SpecSync change cycle are green (Leif/CoS standing order) |

## Not inventing

ACCESS, bounty, MainNet product surfaces. No on-chain identity in v1.

## Allowlists on the bot VM (ALLOW-4)

Default-deny everywhere: **empty/missing allowlist refuses** targeted GitHub plugin runs and Discord channel posts/listens. Deny overrides always win. **Never** treat empty as allow-all (forbid Merlin empty-permissions → BASIC).

1. Write a config file (preferred), e.g. `~/.config/corvidinho/allowlist.toml`:

```toml
[github]
orgs = ["CorvidLabs"]
repos = ["CorvidLabs/Corvidinho"]
users = ["0xLeif"]
deny_repos = []

[discord]
channels = ["123456789012345678"]
roles = ["admin"]
users = []
```

   Or JSON with the same shape. Override path with `CORVIDINHO_ALLOWLIST_FILE`.

2. Optional env overlays (union onto file when non-empty):
   - `CORVIDINHO_GITHUB_ALLOW_REPOS` / `_ORGS` / `_USERS`
   - `CORVIDINHO_GITHUB_DENY_REPOS` / `_ORGS` / `_USERS`
   - `CORVIDINHO_DISCORD_ALLOW_CHANNELS` / `_ROLES` / `_USERS`
   - `CORVIDINHO_DISCORD_DENY_*`

Secrets (`DISCORD_TOKEN`, `GITHUB_TOKEN`, …) stay in env/secret store — never in the allowlist file committed to git.

### AlgoChat / wallets — deferred

WALLET-1..3 captured in `hi/allow.md`. **No wallet ACT** until an approved-wallet allowlist exists. HEAR (#5) must wire Discord channel/user allowlist checks before go-live.

## Next (for Corvidinho bot / follow-on PRs)

- Landed: plugin host + GitHub reads (#6/#4); default-deny allowlists (#16/#18); prove-before-done agent gate (#7)
- Flesh full LLM tool loop on top of prove-before-done
- Wire Discord HEAR behind allowlist stub (`src/allowlist/discord.ts`) — bridges use --no-verify for latency
- Turn draft specs active when behavior stabilizes
- Keep secrets out of repo; keep verify lane honest; no Trust/attest on bootstrap

## Verify locally

```bash
hi check
bun test
bun src/cli.ts --help
fledge lanes run verify --non-interactive
```
