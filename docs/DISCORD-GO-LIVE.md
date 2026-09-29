# Discord HEAR go-live (Developer Portal + VM)

Slash commands, outbound formats, and deny behavior: [`discord.md`](discord.md).
Box updates: [`BOX-UPDATE.md`](BOX-UPDATE.md). Schedule daemon: [`DAEMON.md`](DAEMON.md).
GitHub WATCH: [`WATCH.md`](WATCH.md).

Corvidinho owns config/setup end-to-end for issue #5. **Secrets never go in the repo or chat.**
When the bridge is **READY-FOR-SECRETS** (code merged + checklist below ready), CoS/Leif provide the token via the secure secret-request room — never paste tokens into Discord/GitHub/chat.

Sections A–D get the bridge connected. Section E is the operator guide for the knobs
that shipped after go-live.

## A. Discord Developer Portal

1. Open [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** (name e.g. Corvidinho).
2. **Bot** tab → Add Bot → Reset Token → copy token into the VM secret store only (`DISCORD_TOKEN` or `DISCORD_BOT_TOKEN`). Do not commit.
3. **Privileged Gateway Intents:** enable **Message Content Intent** (required for mention text). The bridge's gateway requests only Guilds, GuildMessages and MessageContent, and role gates read the member roles already on messages and interactions. Enable **Server Members Intent** only if you use the DISCORD-8 requester check: it runs on every `discord-post-message` and `discord-send-file` in a run the bridge started (so whenever `CORVIDINHO_ALLOWLIST` names either tool, E.3), for the Discord user the run acts for, and elsewhere when `--requesting-user-id` is passed (required under `CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK=1`). It logs in a short-lived client with the Guild Members intent, so without the portal toggle that login is refused and nothing is posted.
4. **OAuth2 → URL Generator:** scopes `bot`; bot permissions at least `View Channels`, `Send Messages`, `Read Message History`, `Create Public Threads` (optional for 2.a). Generate invite URL → add bot to the target guild.
5. In Discord: User Settings → Advanced → **Developer Mode** ON → right-click channel → **Copy Channel ID**. Those snowflakes go in `DISCORD_CHANNEL_IDS` / allowlist `[discord].channels` (non-empty required).

## B. Bot VM paths

```bash
mkdir -p ~/.config/corvidinho
cp allowlist.example.toml ~/.config/corvidinho/allowlist.toml
# edit channels = ["YOUR_CHANNEL_ID"]  — empty = refuse start
# A file that cannot be read or parsed also refuses start (bridge, watch, daemon) and makes
# every gate refuse — never an env-only fallback. `corvidinho doctor` shows the line and key.

# Env (secret store / systemd EnvironmentFile — never git):
# DISCORD_TOKEN=…
# DISCORD_CHANNEL_IDS=…          # or rely on allowlist file / CORVIDINHO_DISCORD_ALLOW_CHANNELS
# optional: CORVIDINHO_DISCORD_ALLOW_USERS / _ROLES  (both empty = anyone in an allowlisted channel; once set, only listed users/roles + owner)
# optional: CORVIDINHO_ALLOWLIST_FILE=/path/to/allowlist.toml
# optional DISCORD-6: DISCORD_RATE_LIMIT_WINDOW_MS=60000 DISCORD_RATE_LIMIT_MAX=10
# optional DISCORD-6 mute seed: DISCORD_MUTED_USER_IDS=
# owner = the only ADMIN (IDENTITY-1/2/3): CORVIDINHO_OWNER_DISCORD_ID (+ _GITHUB_LOGIN, _DISPLAY)
#   or allowlist [owner] discord_id / github_login / display (env wins). No owner = nobody ADMIN.
#   CORVIDINHO_DISCORD_ADMIN_USERS / _ROLES are ignored (bridge + doctor warn if set).
# optional DISCORD-8 strict: CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK=1
# optional SAFE-1: CORVIDINHO_ALLOWLIST=…   # dangerous tool names allowed non-interactive (E.3)
# optional SAFE-5: CORVIDINHO_AUDIT_HMAC_KEY=…   # keys the audit chain (E.7)
# LLM: CORVIDINHO_LLM_API_KEY (or OPENAI_API_KEY), CORVIDINHO_LLM_BASE_URL, CORVIDINHO_LLM_MODEL,
#   CORVIDINHO_LLM_TIER=read|tool|code (default tool)
```

Repo templates (no secrets):

- [`.env.example`](../.env.example)
- [`allowlist.example.toml`](../allowlist.example.toml)

## C. Verify before asking for secrets

```bash
bun src/cli.ts doctor          # Discord gate: token + non-empty channels; owner configured yes/no
bun src/cli.ts --protocol-version   # prints 2 (E.2)
# Without token: discord bridge must exit cleanly with checklist (no crash)
bun src/cli.ts discord bridge
```

When doctor/bridge are green **except** missing real token, status is **READY-FOR-SECRETS** — then ping CoS/Leif via the secure room for the token + confirm channel IDs.

`doctor`'s Discord check loads the channel allowlist the way the bridge does: the allowlist
file `[discord].channels` plus `CORVIDINHO_DISCORD_ALLOW_CHANNELS` and `DISCORD_CHANNEL_IDS`.
A channel that is also deny-listed does not count (deny wins). The line names where the
channels came from (`file`, `env` or `file + env`) and how many, never the ids. The
`github-watch` check does the same for `[github]` repos / orgs and
`CORVIDINHO_GITHUB_ALLOW_REPOS` / `_ORGS`. `doctor` also warns when no LLM key is set
(`task run` uses the demo stub) and checks the data dir is writable (`data-dir`). Its
`allowlist-file` check fails when the file exists but cannot be parsed, with the line and key
(never the values); the bridge, `github watch` and `daemon` refuse to start until it is fixed.

## D. Run

```bash
corvidinho discord bridge
# or: CORVIDINHO_DISCORD_DRY_RUN=1 DISCORD_TOKEN=dummy corvidinho discord bridge   # no live connect; any non-empty token value + a channel list still required
```

Long-running processes on the box, one data dir (`CORVIDINHO_DATA_DIR`, default
`~/.local/share/corvidinho`) shared by all of them:

| Process | Command | Needs |
|---------|---------|-------|
| Discord bridge | `corvidinho discord bridge` | token + non-empty channel allowlist |
| GitHub WATCH | `corvidinho github watch` | `GITHUB_TOKEN`/`GH_TOKEN`, `CORVIDINHO_WATCH_USERNAME`, repo/org allowlist ([`WATCH.md`](WATCH.md)) |
| Schedule daemon (optional) | `corvidinho daemon` | same allowlists as the bridge (E.4) |

Each of them spawns `corvidinho task run` from `CORVIDINHO_BIN` (default
`<project root>/src/cli.ts` of the same checkout). After every update, restart all of
them together (E.2).

## E. Operator guide (shipped knobs)

Every name below exists in the code on `main`. When in doubt, the code wins: flags come
from the plugin registry (`corvidinho plugins list`), env names from `src/` and
`plugins/`.

### E.1 Owner = the only ADMIN (IDENTITY-1..3, ADMIN-4)

Set the owner before you deploy. ADMIN is owner-only; nobody else can become ADMIN.

| Source | Keys | Notes |
|--------|------|-------|
| Env (wins per field) | `CORVIDINHO_OWNER_DISCORD_ID`, `CORVIDINHO_OWNER_GITHUB_LOGIN`, `CORVIDINHO_OWNER_DISPLAY` | Discord id must be a digits-only snowflake |
| Allowlist file `[owner]` | `discord_id`, `github_login`, `display` | same file as `CORVIDINHO_ALLOWLIST_FILE` / `~/.config/corvidinho/allowlist.toml`; in a `.json` file, quote `discord_id` (JSON numbers lose snowflake precision) |

- Matching is by Discord snowflake (or lowercased GitHub login) only, never by display name.
  The display name is shown in `doctor`, `/status` and `/admin config show`; ids are never printed.
- No owner, or a Discord id that is not a snowflake ⇒ **nobody is ADMIN** (IDENTITY-3).
  `doctor` shows `owner: configured: no`.
- An owner who is muted (`/mute`, `DISCORD_MUTED_USER_IDS`) or on `[discord].deny_users` is not ADMIN.
- `CORVIDINHO_DISCORD_ADMIN_USERS` / `_ROLES` grant nothing. The bridge logs a warning and
  `doctor` shows an `admin-lists` warning when they are set.
- Owner-only today: `/mute`, `/unmute`, `/admin …`, `/announce channel`, `/schedule create|pause|resume|delete`,
  memory forget/override (from the owner's chat once `CORVIDINHO_ALLOWLIST` names them, E.3, or
  `corvidinho plugins run` with the acting env set; see [`discord.md`](discord.md) Memory),
  mutating tools in a chat session (E.6),
  and the `/work` draft-PR step (E.3).
- When a run asks for a human, a clarify question (AUTONOMY-1/4) pings the requester (the message
  author, or the schedule creator for a scheduled run); a stuck run (AUTONOMY-2) and a spend-cap
  stop (SAFE-8) ping the owner. With no owner a stuck or spend-cap question still posts and the
  bridge logs
  `[discord] run needs a human but no owner is configured — owner ping skipped (AUTONOMY-2 / IDENTITY-3)`.

### E.2 Protocol 2: restart the bridge, WATCH and daemon together (DISCORD-10)

`corvidinho --protocol-version` prints `2` (the NDJSON event stream the bridges read).

- At start the bridge runs `<CORVIDINHO_BIN> --protocol-version`. On a different number it logs
  `[discord] protocol version mismatch: bridge expects 2, corvidinho reports N. Upgrade either binary or the bridge.`
  and exits 1. When the probe cannot run it logs a warning and keeps going.
- `corvidinho daemon` does the same check: `daemon.protocol_mismatch` and exit 1.
- `github watch` has no start probe. Every run's frames carry the protocol number; frames from
  another protocol never become reply text, and the run's summary becomes
  `protocol mismatch: binary N, bridge 2 — restart the bridge`.
- A running process keeps its old code in memory, while `CORVIDINHO_BIN` points at the checkout
  on disk. After an update (or any `git checkout`), restart **the bridge, `github watch` and
  `corvidinho daemon` together**. `scripts/corvidinho-update.sh` restarts only the bridge; restart
  the others yourself (for example `sudo systemctl restart corvidinho-daemon`).

### E.3 SAFE-1 allowlist: `CORVIDINHO_ALLOWLIST`

Every run the bridges start is non-interactive: Discord chat, `/session start`, `/work`,
schedules (bridge or daemon), WATCH, and `delegate` workers all get
`CORVIDINHO_NON_INTERACTIVE=1` (same as `--non-interactive` / `FLEDGE_NON_INTERACTIVE`). A
dangerous plugin then runs only when its exact name is in `CORVIDINHO_ALLOWLIST`
(comma- or space-separated). Otherwise it is refused with
`Denied: plugin "<name>" is marked dangerous and non-interactive mode is on (SAFE-1). Allowlist it (CORVIDINHO_ALLOWLIST) or run interactively.`
and a `denied` row goes to the audit chain.

Set it in the environment of the process that runs the tool. Spawned runs inherit the
bridge's environment, so one `CORVIDINHO_ALLOWLIST` in the bridge's `EnvironmentFile` covers
the bridge's own `/work` PR step and reaches every run it spawns (where it puts those tools
in the owner's tool catalog, see below). The allowlist file
(`CORVIDINHO_ALLOWLIST_FILE`) holds the `[github]` / `[discord]` lists and `[owner]`, not tool names.

Dangerous tools on `main` (printed from the registry after loading the builtins and the
project's Fledge plugins; re-check any time with `corvidinho plugins list`). An entry lets
`corvidinho plugins run` run the tool and offers it to the model in the owner's runs, except
`shell-exec`, the runners and the Fledge core runs `fledge-lanes-run` / `fledge-run` (see
"What an entry unlocks" below):

| Tool | dangerous | minTier | mutating | Allowlist it when |
|------|-----------|---------|----------|-------------------|
| `web-fetch` | true | 1 | true | an operator runs `corvidinho plugins run web-fetch` non-interactively (GET-only, SSRF-guarded, SAFE-7) |
| `fledge-<command>` | true | 2 (native) / 1 (wasm without `exec`) | true | an operator runs `corvidinho plugins run fledge-<command>` non-interactively; one entry per Fledge command you trust, names from `plugins list` (a Fledge plugin command named `run`, `lanes-list`, `lanes-validate` or `lanes-run` is skipped: the Fledge core builtins `fledge-run`, `fledge-lanes-list`, `fledge-lanes-validate` and `fledge-lanes-run` hold those names) |
| `fledge-lanes-run` / `fledge-run` | true | 2 | true | an operator runs `corvidinho plugins run fledge-lanes-run -- <lane>` or `fledge-run -- <task> [args…]` non-interactively; builtins that run fledge's own `lanes run` / `run` in the project dir (PLUGIN-1), so they run whatever that lane or task's commands do; never offered to the model from the allowlist until the SAFE-3 decision |
| `git-commit` | true | 2 | true | `/work` should open draft PRs (needed when the work tree has changes) |
| `git-push` | true | 2 | true | `/work` should open draft PRs; the remote's OWNER/REPO must also pass the GitHub allowlist (GITHUB-6) |
| `github-pr-create` | true | 1 | true | `/work` should open draft PRs; needs `GITHUB_TOKEN`/`GH_TOKEN` |
| `git-branch-create` | true | 2 | true | an operator runs `corvidinho plugins run git-branch-create` non-interactively (`/work` does not need it: the worktree makes the branch) |
| `shell-exec` | true | 2 | true | an operator runs `corvidinho plugins run shell-exec` non-interactively (cwd clamped to the project, SAFE-3); never offered to the model from the allowlist until the SAFE-3 decision |
| `node-exec` / `python-exec` / `cargo-exec` | true | 2 | true | an operator runs `corvidinho plugins run <name>` non-interactively; each is registered only when `node` / `python3` (else `python`) / `cargo` is on PATH (PLUGIN-4), runs that binary with argv only (no shell) starting in the project dir (a start dir, not a clamp: the code it runs can `chdir` elsewhere), and `plugins list` names any that are not loaded; never offered to the model from the allowlist until the SAFE-3 decision |
| `memory-forget` | true | 1 | true | the owner's chat should forget memories on request, or an operator runs `corvidinho plugins run memory-forget` non-interactively with the acting env set (two-phase confirm, SAFE-4), see [`discord.md`](discord.md) Memory |
| `memory-override` | true | 1 | true | the owner's chat should correct memories on request, or an operator runs `corvidinho plugins run memory-override` non-interactively with the acting env set (two-phase confirm, SAFE-4), see [`discord.md`](discord.md) Memory |
| `files-delete` | true | 2 | true | an operator runs `corvidinho plugins run files-delete` non-interactively (SAFE-2 protected paths always refused) |
| `github-issue-create` / `github-issue-comment` / `github-pr-review` | true | 1 | true | the owner's runs should open issues, comment or review PRs (GITHUB-1/3), or an operator runs `corvidinho plugins run <name>` non-interactively |
| `discord-post-message` | true | 1 | true | an operator runs `corvidinho plugins run discord-post-message` non-interactively to post to an allowlisted channel (DISCORD-5/8); in the owner's runs the model can post too, and only where the owner could post themselves (the DISCORD-8 check is for the acting user; needs Server Members Intent) |
| `discord-send-file` | true | 1 | true | the owner's runs should attach files and images (screenshots, logs, diffs, charts) to their replies (DISCORD-17); always in the conversation's own channel, which the bridge sets (no `--channel`), only where the owner could attach files themselves (DISCORD-8 with Attach Files; needs Server Members Intent), 8 MB and a png/jpeg/gif/webp + txt/log/md/diff/patch/json/csv allowlist, text secret-scrubbed, SAFE-2 protected and secret paths refused, see [`discord.md`](discord.md) Files and images in replies |
| `danger-ping` | true | 1 | true | only to test the deny path (no-op) |

Not dangerous, but mutating (no allowlist entry needed; owner-only under ROLES-CHAT, E.6):
`files-write` (minTier 2), `files-edit` (minTier 2), `delegate` and `council` (minTier 2, autonomous extras, E.5).

`minTier` is the capability tier the model needs to see the tool: `1` = `tool`, `2` = `code`
(`CORVIDINHO_LLM_TIER`). `mutating` = dangerous or explicitly marked mutating (ROLES-CHAT-5).

What an entry unlocks **today**:

- `corvidinho plugins run <name>` with `--non-interactive` or `CORVIDINHO_NON_INTERACTIVE=1`.
- The bridge's `/work` draft-PR step: `git-commit` (when the tree is dirty), `git-push` and
  `github-pr-create`. Without them the reply says
  `not opened — opening a PR from /work needs an explicit allow (GITHUB-5): allowlist … (CORVIDINHO_ALLOWLIST)`
  and the changes stay on the work branch. The PR step also needs verify to pass, the requester
  to be the owner, and the repo to pass GITHUB-6.
- The model's tool catalog in `task run` (CLI-3 / SAFE-1). A dangerous tool is offered to the
  model only when the run's `CORVIDINHO_ALLOWLIST` names it and its `minTier` fits the run's
  tier; an unlisted one stays out, and a call to a tool that is not offered is refused. Role
  gates are unchanged: only ADMIN runs (the owner's Discord chat, `/session start` and `/work`)
  and a local `corvidinho task run` get them; non-owner chats, WATCH, schedules and council
  voices never do (E.6). A `delegate` worker gets the lead's effective allowlist (never a wider
  one), so a worker of a local run is offered the same tools, and a worker of a role session is
  non-ADMIN and offered none.
- Never from the allowlist: `shell-exec`, `node-exec`, `python-exec`, `cargo-exec` and the
  Fledge core runs `fledge-lanes-run` and `fledge-run` stay out of the model's catalog even
  when listed, until the SAFE-3 question (can the shell and the runners be kept from leaving
  the project root) is decided. They still run through `corvidinho plugins run`.
- Fledge commands (`fledge-<command>`) are discovered for a run only when the allowlist names
  one and the run is not a non-ADMIN session. Naming a Fledge core builtin (`fledge-lanes-list`,
  `fledge-lanes-validate`, `fledge-lanes-run`, `fledge-run`) starts no discovery. Fledge
  commands can change files without reporting them, so in a project that is not a git work
  tree a run that called one, or a local run's `delegate` worker (which could have), runs the
  verify lane anyway (AGENT-4).
- Allowlisting `git-commit`, `git-push` and `github-pr-create` for the `/work` PR step also
  offers them to the owner's runs, so the model can commit, push or open a PR itself before the
  run's verify.

### E.4 `corvidinho daemon` under systemd (CLI-8, AUTONOMOUS-4)

Run the daemon when schedules should tick without the bridge. Full guide and unit file:
[`DAEMON.md`](DAEMON.md). What an operator needs to know:

- It uses the bridge's environment and adds no variables: `CORVIDINHO_DATA_DIR`,
  `CORVIDINHO_BIN`, the allowlists, the LLM key. Put them in the unit's `EnvironmentFile`
  (mode 600, not in git).
- One daemon per data dir: `<data dir>/daemon.lock`. A second one logs `daemon.lock_held` and exits 1.
- It can run next to the bridge on the same DB. Each due run is claimed once. Runs the daemon
  claims are recorded in the run history; the daemon itself never posts to Discord. A daemon
  run that stops to ask a human (stuck, clarify, spend cap) keeps its question on the run row,
  and the bridge's next scheduler tick posts it to the schedule's channel once (see
  [`DAEMON.md`](DAEMON.md)).
- Scheduled runs are never ADMIN (read/chat tools only, E.6) and always non-interactive (E.3).
- Stop is SIGTERM: it waits up to 30 s for in-flight runs, so keep `TimeoutStopSec` above that
  (the example uses 60). Runs still going after the wait are recorded as failed and their whole
  process trees are killed (`daemon.abandoned`); a second signal skips the wait. Restarts are
  systemd's job (`Restart=on-failure`).
- Logs are JSON lines on stdout: `journalctl -u corvidinho-daemon -o cat`.

### E.5 Autonomous mode gate (AUTONOMOUS-1, AUTONOMOUS-5, SAFE-9)

Autonomous mode is **off** until the project turns it on in its own `fledge.toml`:

```toml
[corvidinho.autonomous]
enabled = true
```

(`autonomous.enabled = true` under `[corvidinho]` is the same key.) Only the literal `true`
counts; a missing file, section or key, or any other value, means off.

- Each `task run` reads `fledge.toml` from its working directory. In a git project, Discord,
  `/work` and schedule runs work in a git worktree made from the project checkout's `HEAD`, so
  **commit** the change there; an uncommitted edit is not seen by those runs.
- `fledge.toml` is protected infra (SAFE-2): the agent's file tools cannot flip the switch.
- Today the gate controls two tools, `delegate` and `council`. The model sees them only when all of these hold:
  the gate is on; the tier is `code` (`CORVIDINHO_LLM_TIER=code`); the session is ADMIN (the
  owner in Discord) or a local CLI run with no role session; and the delegation depth is below 2.
  Workers run at the lead's tier or lower, at most 2 at a time and 4 per lead, and never get
  Discord/GitHub tokens or the audit key. `council` is for a top-level lead only (a delegated
  worker is refused): 2–5 voices (default 3) at `read` tier by default and never above `tool`,
  at most 2 councils per run, 15 min cap per council.
- WATCH and scheduled runs are never ADMIN, so they never get `delegate` or `council`.
- `ask-human` (AUTONOMY-1) is not behind this gate.

### E.6 Non-owner users: ROLES-CHAT

Who is who in an allowlisted channel:

- Owner ⇒ ADMIN (unless muted or on `deny_users`).
- Everyone else ⇒ non-ADMIN. Muted users are refused (the mute and rate gate runs on chat and
  on every slash command).
- `[discord].users` / `.roles` / `deny_users` / `deny_roles` gate every @mention, reply-to-bot,
  thread continuation and slash command, after the channel gate. A user on `deny_users` or
  holding a `deny_roles` role is refused (deny always wins). Once `users` or `roles` has
  entries, only listed users, holders of a listed role and the owner pass (`/admin users add`
  warns when it adds the first user); with both empty, anyone in an allowlisted channel may
  chat. A refused chat message gets no reply, session or run; a refused slash command gets only
  an ephemeral zero-width ack.

Non-ADMIN sessions (every non-owner in Discord, plus all WATCH and scheduled runs):

- **Catalog:** only read/chat tools. No dangerous or mutating tool is offered, so no file
  write/edit/delete, no shell, no git/GitHub writes, no Discord posts, no memory
  forget/override, no `delegate`/`council`, no `web-fetch` (dangerous counts as mutating).
  Read tools stay, including `files-read`/`-list`/`-glob`, `search-grep`,
  `git-status`/`-diff`/`-log`/`-branch-list`, GitHub reads, `specsync-*` reads,
  `fledge-lanes-list`/`-validate`,
  `memory-store`/`-recall` (scoped to the acting user), `discord-user-lookup` (members of
  the configured `DISCORD_GUILD_ID` only, IDENTITY-5) and `plugins-list`.
- **Run time:** a mutating call the model makes anyway, including one to a tool it was never
  offered, is refused with `not allowed for your role` (ROLES-CHAT-3) and nothing runs. The
  refusal is not posted on its own; the reply ends with a short `(not allowed for your role)`
  line instead, kept when a long reply is cut to fit: chat replies, `/session start` and
  `/work` answers, schedule posts and the run history they come from, a reply shortened for
  the SAFE-8 80% spend warning, and the WATCH summary comment all lose the end of the text,
  never the line. A run that ends by asking a question
  posts the question, which can leave the line out. A call to a name that is not a plugin at
  all keeps the plain "not offered" refusal and adds no line. ADMIN is re-checked on every
  call against the live owner config; the prompt never grants it.
- **Public Q&A (ROLES-CHAT-8):** GitHub reads work for any **public** repo. Private repos, and
  repos whose visibility cannot be confirmed, are refused; deny lists still win. Secret-looking
  paths (`.env*`, `.ssh`, keystores, `credentials`, `id_rsa`, `id_ed25519`, `*.pem`) are
  refused when named to `files-read`, `files-list`, `search-grep` or `git-diff`, and left out
  of `files-glob` / `files-list` results, recursive `search-grep` output and `git-diff`.
- `/session start` and `/work` run for non-owners too, as non-ADMIN sessions. `/work` never
  opens a PR for a non-owner.
- The owner keeps the GitHub allowlist (GITHUB-6) and still passes every SAFE gate.
- A local `corvidinho task run` in a shell has no role session, so these gates do not apply
  there. The bridges always set `CORVIDINHO_ACTING_IS_ADMIN` to `0` or `1` for their runs.

### E.7 Where the logs and the audit trail live

All paths default to the data dir `~/.local/share/corvidinho` (`CORVIDINHO_DATA_DIR`).

| What | Where | How to read |
|------|-------|-------------|
| SAFE-5 audit chain (dangerous plugin runs incl. denials, `/admin` mutations, `/schedule delete`) | table `audit_log` in `<data dir>/corvidinho.db` (append-only; rows hold action, actor, surface, args digest, outcome, exit code, never raw args) | bridge start log `[discord] Audit: N entries · chain OK (keyed)`, `/status`, `/admin config show`; or any SQLite client, e.g. `sqlite3 ~/.local/share/corvidinho/corvidinho.db 'SELECT seq, ts, action, actor, surface, outcome, exit_code FROM audit_log ORDER BY seq DESC LIMIT 20'` |
| Audit key | `CORVIDINHO_AUDIT_HMAC_KEY` (env only, never in the DB) | set the **same** key on every process that shares the data dir; without it the chain is plain SHA-256 and the line says `unkeyed — set CORVIDINHO_AUDIT_HMAC_KEY`. Once the chain holds a keyed row, a process without the key refuses dangerous plugin runs, `/admin` changes and `/schedule delete` (`audit log unavailable … (SAFE-5)`), and an unkeyed row after a keyed row reads as `chain BROKEN at #N` |
| WATCH spawn outcomes | `<data dir>/watch-spawn.jsonl` (override `CORVIDINHO_WATCH_SPAWN_LOG`) plus `[watch] spawn start …` / `[watch] spawn outcome …` lines on stdout | one JSON object per run: start/finish time, repo#number, exit code, error class, duration |
| Daemon | JSON lines on stdout (journald under systemd) | `journalctl -u corvidinho-daemon -o cat \| jq 'select(.event == "run.finished")'` |
| Bridge | stdout/stderr (`[discord] …`): journald under systemd, or `/tmp/corvidinho-discord-bridge.log` (`CORVIDINHO_BRIDGE_LOG`) when `scripts/corvidinho-update.sh` starts it in pidfile mode | protocol check, audit line, admin-list and owner warnings |
| Schedule run history | tables `schedules` / `schedule_runs` in `corvidinho.db` | `/schedule list` (last run, run count); the daemon's `run.finished` events |
| Discord sessions and `/work` tasks | tables `discord_sessions` / `discord_work_tasks` in `corvidinho.db` | `/session list`, `/status` |
| Per-session worktrees | `.corvid-worktrees` next to the project (override `WORKTREE_BASE_DIR`) | `git worktree list` in the project |

Free-text columns in `corvidinho.db` and every string value in the daemon's log lines are
scrubbed for secrets before they are written (SAFE-6). The audit chain stores an args digest,
never the args.
