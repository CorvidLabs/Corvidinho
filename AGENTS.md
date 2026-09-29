# AGENTS.md — Corvidinho

Linux-only Bun/TypeScript agent runner. CLI-first. No Windows target. No Trust re-add on this bootstrap.

## HI-first

Before product decisions, read `hi/`. Criteria live in `hi/*.md` (agent, allow, discord, github, watch, fledge, specsync, cli, plugin, safe, autonomous, memory, identity, admin, autonomy, session, roles, ops, persona). Also DISCORD-SCHEDULE / DISCORD-ANNOUNCE / DISCORD-ASK / DISCORD-DENY / SESSION-WORKTREE / SESSION-MULTI / MEMORY-ACL / ROLES-CHAT / WATCH-RELIABILITY compound ids in those files. Capture confirmed wants with `hi`.

**Do not invent** ACCESS, bounty, or MainNet product surfaces. Do not invent acceptance criteria that are not in `hi/` or that Leif has not confirmed.

Human inventory notes (not acceptance criteria): `docs/CORVIDINHO-FEATURE-STEAL.md`, `docs/CORVIDINHO-HI-DRAFT-FULL.md`. Discord UX inventory: [`docs/discord.md`](docs/discord.md).


## Process / governance (PROCESS-1..5)

Standing order (Leif confirm 2026-09-26):

1. **PROCESS-1 — HI-first.** Draft → human confirm → capture into `hi/`; never invent acceptance criteria.
2. **PROCESS-2 — SpecSync SDD + CI Action.** Full change cycle (change → verify → approve → archive); `.github/workflows/spec-sync.yml` required in CI.
3. **PROCESS-3 — Autonomous merge on Corvidinho.** Agents may approve/merge own work when verify + SpecSync are green (peer to human for changes on this repo).
4. **PROCESS-4 — Respect CODEOWNERS elsewhere.** No bypass of protected paths/owners outside Corvidinho.
5. **PROCESS-5 — Fledge Actions deferred.** Prefer local `fledge lanes run verify --non-interactive` in the agent loop; do not invent Fledge Actions product surface yet.

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
bun src/cli.ts doctor           # exits 1 until the Discord, GitHub and WATCH checks pass (they read the allowlist file + env, like the bridge and watch)
bun src/cli.ts version
bun src/cli.ts --protocol-version
bun src/cli.ts attribution
bun src/cli.ts plugins list
bun src/cli.ts specsync list
bun src/cli.ts task run --task "touch agent loop" --no-verify --json   # demo stub unless CORVIDINHO_LLM_API_KEY/OPENAI_API_KEY is set
bun src/cli.ts discord bridge   # needs DISCORD_TOKEN + non-empty channel allowlist; a malformed allowlist file refuses start
bun src/cli.ts discord register-commands   # guild PUT of the 9 slash commands + clear globals with DISCORD_GUILD_ID or --guild-id (without one: global register + a warning)
bun src/cli.ts github watch     # needs GITHUB_TOKEN + CORVIDINHO_WATCH_USERNAME + non-empty GitHub repo/org allowlist
bun src/cli.ts daemon           # headless schedule ticker (docs/DAEMON.md)
bun test
hi check
fledge lanes run verify --non-interactive
```
