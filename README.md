# Corvidinho

Lean Bun/TypeScript Linux CLI for day-to-day Discord and GitHub work — a revamp of corvid-agent without a heavy UI, without on-chain identity in v1, and without a long compile loop.

**Status:** bootstrap. Human intent lives in [`hi/`](hi/). Steal/defer inventory for humans: [`docs/CORVIDINHO-FEATURE-STEAL.md`](docs/CORVIDINHO-FEATURE-STEAL.md).

## Requirements

- Linux
- [Bun](https://bun.sh) ≥ 1.2
- Optional on `PATH`: `gh`, `fledge`, `specsync` (reported by `corvidinho doctor`)

## Quick start

```bash
bun install
bun src/cli.ts --help
bun src/cli.ts version
bun src/cli.ts doctor
bun test
```

Secrets (`DISCORD_TOKEN` / `DISCORD_BOT_TOKEN`, GitHub via `gh auth`) stay in the environment — never in the repo or chat logs.

## Fledge lanes

```bash
fledge run smoke
fledge lanes run pre-commit --non-interactive
fledge lanes run verify --non-interactive
fledge lanes run ci --non-interactive
```

## SpecSync

Module contracts under `specs/`. Verified change workflow is **off** until deliberately enabled. CI runs `specsync check`.

## Agent rules

See [`AGENTS.md`](AGENTS.md): HI-first, never merge unless explicitly asked, secrets out of repo, prefer Fledge plugins.

## License

MIT — CorvidLabs.
