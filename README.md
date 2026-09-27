# Corvidinho

Linux-first Bun/TypeScript agent runner from CorvidLabs — a headless agent CLI with a Discord bridge (HEAR), GitHub poll ingress (WATCH), a schedule daemon, typed plugin tools and a prove-before-done LLM tool loop. First-class Fledge + SpecSync citizen; human intent lives in `hi/`. Version: `bun src/cli.ts version`; per-version notes: [`CHANGELOG.md`](CHANGELOG.md).

**Status:** see [`STATUS.md`](STATUS.md). Intent: [`hi/`](hi/). Steal/defer notes (not AC): [`docs/CORVIDINHO-FEATURE-STEAL.md`](docs/CORVIDINHO-FEATURE-STEAL.md).

## Lineage

Corvidinho is the third CorvidLabs agent-runner generation — best of
[corvid-agent](https://github.com/CorvidLabs/corvid-agent) and
[merlin](https://github.com/CorvidLabs/merlin), kept light for bots/VMs.
Read the full story (honoring ancestors): [`docs/ORIGIN.md`](docs/ORIGIN.md).

## Requirements

- Linux, `git` (session worktrees and the git tools)
- [Bun](https://bun.sh) ≥ 1.2
- `fledge` + `specsync` on `PATH` (`corvidinho doctor` fails without them; the verify lane needs both)
- Optional: `hi` (`hi check`), `gh` (human convenience only; Corvidinho itself reads `GITHUB_TOKEN` / `GH_TOKEN`)

## Quick start

```bash
bun install
bun src/cli.ts --help
bun src/cli.ts version
bun src/cli.ts doctor
bun src/cli.ts --protocol-version
bun test
hi check
```

Secrets (`DISCORD_TOKEN` / `DISCORD_BOT_TOKEN`, `GITHUB_TOKEN` / `GH_TOKEN`) stay in the environment — never in the repo or chat logs.

## Discord HEAR (thin)

```bash
# Go-live on the bot VM (never commit secrets):
export DISCORD_TOKEN=…          # or DISCORD_BOT_TOKEN
export DISCORD_CHANNEL_IDS=…    # non-empty; or CORVIDINHO_DISCORD_ALLOW_CHANNELS / allowlist file
export CORVIDINHO_OWNER_DISCORD_ID=…   # the only ADMIN (/admin, /mute, /announce channel, /schedule mutations); no owner = nobody is ADMIN
bun src/cli.ts discord bridge
```

Empty channel allowlists **refuse start** (default-deny; not Merlin BASIC), and so does an allowlist file the loader cannot parse. Without a token the CLI exits cleanly with a checklist — see [`STATUS.md`](STATUS.md). Thinking status, slash commands, rate limits/mutes, admin re-auth and image attachments (#10–#14) shipped in #25–#29. Templates: [`.env.example`](.env.example), [`allowlist.example.toml`](allowlist.example.toml). Full checklist: [`docs/DISCORD-GO-LIVE.md`](docs/DISCORD-GO-LIVE.md). Slash/outbound/deny UX: [`docs/discord.md`](docs/discord.md). Box updates: [`docs/UPDATE.md`](docs/UPDATE.md). **READY-FOR-SECRETS** → request token via CoS/Leif secure room only (never chat paste).


## GitHub WATCH (poll-first)

```bash
export GITHUB_TOKEN=…
export CORVIDINHO_WATCH_USERNAME=corvid-agent
export CORVIDINHO_GITHUB_ALLOW_REPOS=CorvidLabs/Corvidinho
export CORVIDINHO_GITHUB_ALLOW_USERS=0xLeif
bun src/cli.ts github watch
```

**Poll-first for bot/VM** (no public URL). Webhook deferred. Empty GitHub allowlists refuse start. Details: [`docs/WATCH.md`](docs/WATCH.md).

## Schedule daemon

```bash
bun src/cli.ts daemon
```

Ticks `/schedule` work on the Linux host without Discord or a REPL (CLI-8 / AUTONOMOUS-4). One daemon per data dir; JSON-line logs; SIGTERM stops it cleanly. systemd unit and details: [`docs/DAEMON.md`](docs/DAEMON.md).

## Fledge lanes

```bash
fledge run smoke
fledge lanes run pre-commit --non-interactive
fledge lanes run verify --non-interactive   # local/agent gate (Bun lint/smoke/test)
```

GitHub Actions runs **Bun smoke/test/typecheck** plus the dedicated
**Spec Sync** workflow (`CorvidLabs/spec-sync@v6`). Fledge verify stays local
for now.

## SpecSync

- `.specsync/` — config, registry, version, `sdd.json` (**SDD change workflow ON**)
- `specs/{agent,cli,discord,plugins,watch}/` — module specs (all `draft`) + companions
- CI: `.github/workflows/spec-sync.yml` uses `CorvidLabs/spec-sync@v6` (version `6.0.0`)

Run `fledge run spec-check` locally: it is `specsync check --require-coverage 100`,
the CI Spec Sync strictness, and it is a step of the verify lane.
`corvidinho specsync coverage` / `score` print SpecSync's coverage and score
reports. Open changes with `specsync change` before
meaningful edits. Promote draft specs to `active` when behavior stabilizes.
Do not invent ACCESS/bounty/MainNet surfaces.

## Agent rules

See [`AGENTS.md`](AGENTS.md): HI-first, Linux-only, no invent AC, secrets out of repo.


## Allowlists (bot VM)

Corvidinho is **default-deny**: empty/missing allowlists refuse targeted GitHub plugin runs and Discord listen/post checks. Deny always wins. Do not copy Merlin’s empty-permissions → BASIC allow-by-default. An allowlist file that exists but cannot be read or parsed **fails closed**: the bridge, `github watch` and `daemon` refuse to start and the gates refuse, never falling back to env-only lists (`corvidinho doctor` names the line and key).

On the bot VM:

```bash
mkdir -p ~/.config/corvidinho
# edit ~/.config/corvidinho/allowlist.toml  (or .json)
# or: export CORVIDINHO_ALLOWLIST_FILE=/path/to/allowlist.toml
# env overlays: CORVIDINHO_GITHUB_ALLOW_REPOS, CORVIDINHO_DISCORD_ALLOW_CHANNELS, …
```

See [`STATUS.md`](STATUS.md) for the full shape. AlgoChat / wallet ACT is **deferred** until a wallet allowlist exists (`hi/allow.md` WALLET-*). HEAR (#5) is in-tree; live @bot still needs token + non-empty Discord allowlists on the VM.

## License

MIT — CorvidLabs.
