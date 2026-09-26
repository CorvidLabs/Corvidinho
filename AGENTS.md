# AGENTS.md — Corvidinho

Scope: lean Bun/TS Linux CLI for Discord and GitHub work. No heavy UI. No on-chain identity in v1.

## HI-first

Before product decisions, read `hi/`. Criteria live in `hi/*.md` (agent, discord, github, fledge, specsync, cli, plugin, safe, autonomous). Capture confirmed wants with `hi`; do not invent ACCESS, bounty, or MainNet surfaces.

Human inventory notes (not acceptance criteria): `docs/CORVIDINHO-FEATURE-STEAL.md`, `docs/CORVIDINHO-HI-DRAFT-FULL.md`.

## Never merge

Corvidinho **never merges** a pull request unless a human explicitly asked it to (see `hi/github.md` / ACT-shaped wants). Draft PRs are the default ship shape. Do not merge bootstrap or feature PRs from this agent unless Leif said so in that turn.

## Secrets

Discord and GitHub secrets stay out of the repo and out of chat logs (`hi/safe.md` / RUN-1). Use env / `gh auth`. Never commit `.env`.

## Fledge + SpecSync

- Prefer Fledge plugin commands over raw shell when a plugin covers the job.
- Before claiming done, run `fledge lanes run verify --non-interactive` (or the project verify lane).
- SpecSync change workflow stays **off** until deliberately enabled (`hi/specsync.md` SPECSYNC-5 / SPEC family). Do not open change workspaces unless that is turned on.
- New specs go through SpecSync layout (`specsync scaffold` / `add-spec`), not orphan hand files.

## Platform

Linux-only. Bun + TypeScript. CLI-first; optional thin web later.

## Bootstrap commands

```
bun install
bun src/cli.ts --help
bun src/cli.ts doctor
bun src/cli.ts version
bun test
fledge lanes run verify --non-interactive
```
