# AGENTS.md — Corvidinho

Linux-only Bun/TypeScript agent runner. CLI-first. No Windows target. No Trust re-add on this bootstrap.

## HI-first

Before product decisions, read `hi/`. Criteria live in `hi/*.md` (agent, discord, github, fledge, specsync, cli, plugin, safe, autonomous). Capture confirmed wants with `hi`.

**Do not invent** ACCESS, bounty, or MainNet product surfaces. Do not invent acceptance criteria that are not in `hi/` or that Leif has not confirmed.

Human inventory notes (not acceptance criteria): `docs/CORVIDINHO-FEATURE-STEAL.md`, `docs/CORVIDINHO-HI-DRAFT-FULL.md`.

## Merge policy

Draft PRs are the default ship shape. Agents **may merge** Corvidinho PRs when SpecSync change cycle + `fledge lanes run verify --non-interactive` are green (Leif/CoS standing order). Prefer GitHub approve when allowed; if same-author approve is blocked, merge once required checks pass. Do not merge unrelated repos or skip verify.

## Secrets

Secrets stay out of the repo and out of chat logs (`hi/safe.md`, SAFE-6). Use env / `gh auth`. Never commit `.env`.

## Fledge + SpecSync

- Prefer Fledge / SpecSync plugin commands over raw shell when a plugin covers the job (`specsync-list|read|check|brief`).
- Before claiming done, run `fledge lanes run verify --non-interactive` (verify lane includes local `spec-check`).
- Planning loads relevant specs via Merlin `spec_loader` pattern when task text is provided (`--task`).
- SpecSync SDD / change cycle is **ON** (`hi/specsync.md` SPECSYNC-4). Every material change: `specsync change new` → specs/artifacts → implement → `specsync check` → `fledge lanes run verify --non-interactive` → review → finalize/archive.
- CI still runs `.github/workflows/spec-sync.yml` (Spec Sync Action) separately from Bun smoke CI.
- New specs go through SpecSync layout, not orphan hand files.
- Merge Corvidinho PRs only when verify + change cycle are green (approve if GitHub allows; merge when checks pass if same-author approve is blocked).

## Bootstrap commands

```
bun install
bun src/cli.ts --help
bun src/cli.ts doctor
bun src/cli.ts version
bun src/cli.ts --protocol-version
bun src/cli.ts plugins list
bun src/cli.ts specsync list
bun src/cli.ts task run --task "touch agent loop" --no-verify --json
bun src/cli.ts discord bridge   # needs DISCORD_TOKEN + non-empty channel allowlist
bun test
hi check
fledge lanes run verify --non-interactive
```
