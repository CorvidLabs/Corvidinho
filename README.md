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
- In the project dir: `fledge.toml` with a `verify` lane that runs spec-check and a test step whose summary Corvidinho recognises (`bun test`, jest, vitest, `cargo test`, pytest or `go test`: a lane that shows no test ran is never "verified", AGENT-15), `.specsync/` and `specs/` (`corvidinho doctor` names each one that is missing, and prints a `[warn] test-step` line when no verify-lane step visibly runs one of those runners — a wrapper such as `npm test` may still print a summary, so it does not fail doctor; `corvidinho init` reports the same project checks plus the model provider, Fledge and SpecSync, and creates nothing)
- A model you configure (AGENT-13): `CORVIDINHO_LLM_MODEL=openai:<model>` (with `CORVIDINHO_LLM_API_KEY` / `OPENAI_API_KEY`), `ollama:<model>` (`OLLAMA_HOST`, no key) or `anthropic:<model>` (`ANTHROPIC_API_KEY`); a comma list is a fallback chain, so when a model fails or is retired the run goes on with the next one and says so (AGENT-11). There is no built-in default: with none set, runs fail and `doctor`, `/status` and each surface's startup say so (AGENT-10). Upgrading from a key-only setup: set `CORVIDINHO_LLM_MODEL` (see [`docs/DISCORD-GO-LIVE.md`](docs/DISCORD-GO-LIVE.md) E.9)
- Optional: `hi` (`hi check`), `gh` (human convenience only; Corvidinho itself reads `GITHUB_TOKEN` / `GH_TOKEN`)

## Quick start

```bash
bun install
bun src/cli.ts --help
bun src/cli.ts version
bun src/cli.ts doctor
bun src/cli.ts init    # report only: what this project is missing (CLI-4)
bun src/cli.ts --protocol-version
bun test
hi check
```

Secrets (`DISCORD_TOKEN` / `DISCORD_BOT_TOKEN`, `GITHUB_TOKEN` / `GH_TOKEN`, the LLM keys) stay in the environment — never in the repo or chat logs.

### `task run` works in its own worktree (SESSION-WORKTREE-1.a)

```bash
bun src/cli.ts task run --task "…"          # in a git repo: a new worktree made from HEAD
bun src/cli.ts task run --here --task "…"   # in this checkout
```

In a git repo, `task run` works in its own new git worktree by default, made from the
checkout's `HEAD` next to the repo (`WORKTREE_BASE_DIR`, default `../.corvid-worktrees`,
branch `talk/cli_…`), in the same subdirectory you started it from. Uncommitted and untracked
files (a local `.env`, `node_modules`) are not in it and nothing is installed there; the first
line of the run says so. At the end a clean worktree is removed, and its branch too unless it
has commits of its own; one with changes is kept and named (stderr, and `result.workspace` in
`--json` / ndjson). If the worktree can't be made the run stops (exit 1) and says to pass
`--here`, which runs it in the current checkout as before. Outside a git repo it works in the
folder itself.

The shell, the language runners and the Fledge lane/task runs (`shell-exec`, `node-exec` /
`python-exec` / `cargo-exec`, `fledge-lanes-run`, `fledge-run`) are offered to the model in a
local run only inside that new worktree, and only when `CORVIDINHO_ALLOWLIST` names them at code
tier (SAFE-3.a). With `--here`, outside a git repo or from a subdirectory of the repo they are
not offered, and the run prints one `[operator] SAFE-3.a: … allowlisted but not offered: <why>`
line. A `task run` the model starts from its own shell, a runner or a Fledge run is not offered
them either. A prod or deploy command still waits for the owner's Approve card; with no Discord bridge
running nobody answers it, so it lapses as a no and the run says so.

### Turn cap and idle timeout (AGENT-12)

Two optional limits stop endless or stalled runs on every surface (CLI, Discord, WATCH,
schedules; delegate and council workers inherit them):

- `CORVIDINHO_MAX_TURNS` (default 8): model/tool rounds per attempt; each verify retry gets
  its own. A run whose last attempt hits it ends with its best answer so far and says so
  (`stopReason: "turn-cap"` in `--json` / ndjson, a plain line after the summary in text mode).
- `CORVIDINHO_IDLE_TIMEOUT_MS` (default 600000, 10 minutes): a run with no output — events,
  tool output, verify-lane output — for that long is stopped, its tools and verify lane killed
  with their process trees, and it fails (exit 1) with `Stopped: no output for 10 minutes (idle
  timeout).` as the first line of its summary and as its `error`. Model calls,
  delegate/council workers and Approve-card waits do not count as idle. A step that ignores
  the stop is waited for at most 5 more seconds; then the run ends failed anyway.

A value that is not a positive whole number is ignored with a one-line note, and the default
is used.

### Another project without `cd` (CLI-5)

```bash
bun src/cli.ts --project ~/code/other task run --task "…" --json
bun src/cli.ts doctor --project=../other
```

`--project <path>` (any command, before a `--`) runs the CLI as if it had been started in
`<path>`: it reads that project's `fledge.toml`, specs and files, and its `.env` files as Bun
loads them there (`.env`, `.env.<NODE_ENV>`, `.env.local`; variables already set in the
environment win; a CLI run with `bun --no-env-file` loads none). The start directory's `.env`
values do not carry over, to this process or to the tools it starts (`specsync`, `fledge`, git),
and the project's `bunfig.toml` is never read. Spawned agents still run with `--no-env-file`.
`discord bridge`, `github watch` and `daemon` take `<path>` as their project root, so their agent
binary defaults to `<path>/src/cli.ts` as when started there; set `CORVIDINHO_BIN` when `<path>`
is not a Corvidinho checkout. A path that does not exist or is not a directory stops with one
error line (exit 1).

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

## Second-model review before a PR (GITHUB-9)

Before `github-pr-create` opens a PR, a second model reviews the diff in at most 3 rounds, and the PR body lists what it raised and what changed. The reviewer is the first configured model that did not write the change; there is no reviewer setting, so configure at least two models (`CORVIDINHO_LLM_MODEL` and the per-tier keys), or there is no PR and the reply says why (GITHUB-9.a). Details: [`docs/discord.md`](docs/discord.md#second-model-review-before-every-pr-github-9--github-9a).

## Schedule daemon

```bash
bun src/cli.ts daemon
```

Ticks `/schedule` work on the Linux host without Discord or a REPL (CLI-8 / AUTONOMOUS-4). One daemon per data dir; JSON-line logs; SIGTERM stops it cleanly. With no bridge running, a schedule's question still reaches the owner by DM (AUTONOMOUS-7.a; needs the bot token and the owner set). systemd unit and details: [`docs/DAEMON.md`](docs/DAEMON.md).

## Nightly backup

```bash
export CORVIDINHO_BACKUP_DIR=/var/backups/corvidinho   # absolute, local, outside any git repo
bun src/cli.ts backup list
bun src/cli.ts backup restore corvidinho-20260929T030001Z.db /tmp/check.db
```

With `CORVIDINHO_BACKUP_DIR` set, the bridge or daemon tick copies `corvidinho.db` once a night (from 03:00 local time) as a consistent SQLite snapshot (mode 0600, newest 7 kept) and once a week restores the newest into a temp dir to check it (OPS-1/2). A failure is logged and the owner is pinged once per failure streak in the `/announce` channel. Unset = no backup; `corvidinho doctor` says so. Restore never overwrites a DB a process holds open. Details: [`docs/DAEMON.md`](docs/DAEMON.md#nightly-backup-ops-12).

## Daily briefings

Every working day the owner and each declared team member get one short DM about their own work — what changed on GitHub, what's blocked, what needs them, what it did for them — at the start of their working hours in their time zone (COS-1/2/2.a). Set a person's `timezone` and `working_hours` in their `[people.<id>]` entry or with `/admin people add`; without them it uses the owner's time zone (else UTC) and 09:00. Sent by the running Discord bridge only, written by one read-tier model call under the spend caps; days with nothing to say are skipped; `[corvidinho.plugins] schedule = false` turns them off with the scheduler (PLUGIN-5.a). Details: [`docs/discord.md`](docs/discord.md#daily-briefings-cos-1--cos-2--cos-2a-102).

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

## Persona (PERSONA-1..3)

Corvidinho's voice lives in one file, [`persona.md`](persona.md) at the root of this checkout: corvid-agent's voice, warm and direct, with some personality and emoji, never a flat changelog. Every run on every surface (Discord chat, slash commands, `/work`, schedules, GitHub WATCH, `task run`, delegate and council workers) reads it again into the system prompt, ahead of Corvidinho's rules (a run as a named persona, below, uses that persona's voice instead). The rules come after it and win: one message per turn, no spam, no unchecked claims.

To change the voice, edit the file and commit it (on the bot VM: merge it, then update). Only the committed copy is loaded, so a run cannot plant its own persona. The file is capped at 8 KiB and scrubbed for secrets (SAFE-6), but keep secrets out of it anyway. A missing, empty or refused file never stops a run: the run goes on without a persona and one `Persona: …` note in the run's output (never posted to Discord or GitHub) says why. Fixed-text bot posts (the bridge's update note, `/status`, error lines) do not go through the model and keep their text; the update note after a restart is written in this voice as one short line linking the version's release notes, not a changelog (PERSONA-1.a). There is no setting, env var or restart for it.

**Named personas (AUTONOMOUS-2 / AUTONOMOUS-2.a, AUTONOMOUS-5 / AUTONOMOUS-5.a).** `persona.md` stays the default voice. Each named persona is its own file in `personas/` next to it, with its name, model, skill tags and voice:

```markdown
---
name: reviewer
model: anthropic:claude-sonnet-4-5
skills: [review, specsync]
---
The reviewer's voice: terse, exacting, cites the line it means.
```

`model` is one `kind:model` entry you already configured (`CORVIDINHO_LLM_MODEL` or a per-tier key); any other model is refused with one plain line and nothing is called. A run as a persona uses its voice in place of `persona.md` (the rules still come after it and win) and calls its model first, with the tier's other configured models after it as the fallback chain, so spend caps, the fallback notice and the no-provider notice apply as usual. Only you pick a persona for a run: `corvidinho task run --persona reviewer --task "…"` or `/session start persona:reviewer` (for that run only; replies in the session go back to `persona.md`). A lead's `delegate --skill review` runs its worker as the first persona by name whose skill tags hold `review` exactly (no match = a plain worker as before); the lead's `delegate` tool lists each persona it can pick with its skill tags (never its voice or model), and workers keep their limits. Team members and the community can't pick a persona. The files load like `persona.md`: only the committed copy, 8 KiB each, scrubbed, read again on every run; the agent's file tools can't change Corvidinho's own `personas/` folder (SAFE-2). Up to 32 files are read; a bad file is skipped and named when you ask for it.


## Allowlists (bot VM)

Corvidinho is **default-deny**: empty/missing allowlists refuse targeted GitHub plugin runs and Discord listen/post checks. Deny always wins. Do not copy Merlin’s empty-permissions → BASIC allow-by-default. An allowlist file that exists but cannot be read or parsed **fails closed**: the bridge, `github watch` and `daemon` refuse to start and the gates refuse, never falling back to env-only lists (`corvidinho doctor` names the line and key); a running `github watch` skips each poll until it loads again.

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
