# Corvidinho

Linux-first Bun/TypeScript agent runner from CorvidLabs. Plans to **support Fledge + SpecSync as products**. Bootstrap captures human intent (`hi/`) and a minimal CLI stub so follow-on PRs have a place to land.

**Status:** see [`STATUS.md`](STATUS.md). Intent: [`hi/`](hi/). Steal/defer notes (not AC): [`docs/CORVIDINHO-FEATURE-STEAL.md`](docs/CORVIDINHO-FEATURE-STEAL.md).

## Requirements

- Linux
- [Bun](https://bun.sh) ≥ 1.2
- Optional on `PATH`: `hi`, `gh`, `fledge`, `specsync` (reported by `corvidinho doctor`)

## Quick start

```bash
bun install
bun src/cli.ts --help
bun src/cli.ts version
bun src/cli.ts doctor
bun test
hi check
```

Secrets (`DISCORD_TOKEN` / `DISCORD_BOT_TOKEN`, GitHub via `gh auth`) stay in the environment — never in the repo or chat logs.

## Fledge lanes

```bash
fledge run smoke
fledge lanes run pre-commit --non-interactive
fledge lanes run verify --non-interactive   # includes spec-check (needs specsync)
```

## SpecSync seed

Minimal project layout:

- `.specsync/` — `config.toml`, `registry.toml`, `version`, `sdd.json` (change workflow **off**)
- `specs/cli/` — draft stub for the CLI module + companions

Run `specsync check`. Promote draft specs to `active` when behavior stabilizes. Do not invent ACCESS/bounty/MainNet surfaces.

## Agent rules

See [`AGENTS.md`](AGENTS.md): HI-first, Linux-only, no invent AC, never merge without ask, secrets out of repo.

## License

MIT — CorvidLabs.
