# AGENTS.md — Corvidinho

Linux-only Bun/TypeScript agent runner. CLI-first. No Windows target. No Trust re-add on this bootstrap.

## HI-first

Before product decisions, read `hi/`. Criteria live in `hi/*.md` (agent, discord, github, fledge, specsync, cli, plugin, safe, autonomous). Capture confirmed wants with `hi`.

**Do not invent** ACCESS, bounty, or MainNet product surfaces. Do not invent acceptance criteria that are not in `hi/` or that Leif has not confirmed.

Human inventory notes (not acceptance criteria): `docs/CORVIDINHO-FEATURE-STEAL.md`, `docs/CORVIDINHO-HI-DRAFT-FULL.md`.

## Never merge without ask

Corvidinho **never merges** a pull request unless a human explicitly asked it to in that turn (see `hi/github.md`). Draft PRs are the default ship shape.

## Secrets

Secrets stay out of the repo and out of chat logs (`hi/safe.md`, SAFE-6). Use env / `gh auth`. Never commit `.env`.

## Fledge + SpecSync

- Prefer Fledge plugin commands over raw shell when a plugin covers the job.
- Before claiming done, run `fledge lanes run verify --non-interactive`.
- SpecSync change workflow stays **off** until deliberately enabled (`hi/specsync.md` SPECSYNC-4). Do not open change workspaces unless that is turned on.
- New specs go through SpecSync layout, not orphan hand files.

## Bootstrap commands

```
bun install
bun src/cli.ts --help
bun src/cli.ts doctor
bun src/cli.ts version
bun test
hi check
fledge lanes run verify --non-interactive
```
