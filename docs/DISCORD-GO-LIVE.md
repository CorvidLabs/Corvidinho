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
4. **OAuth2 → URL Generator:** scopes `bot`; bot permissions at least `View Channels`, `Send Messages`, `Read Message History`, `Create Public Threads` (optional for 2.a), `Attach Files` (uploads need it: `discord-send-file`, DISCORD-17; without it Discord refuses the upload). Generate invite URL → add bot to the target guild.
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
#   or allowlist [owner] discord_id / github_id / github_login / display (env wins). No owner = nobody ADMIN.
#   On GitHub the owner is recognised only by [owner] github_id (numeric user id; file only), never the login.
#   CORVIDINHO_DISCORD_ADMIN_USERS / _ROLES are ignored (bridge + doctor warn if set).
# optional DISCORD-8 strict: CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK=1
# optional SAFE-1: CORVIDINHO_ALLOWLIST=…   # dangerous tool names allowed non-interactive (E.3)
# optional SAFE-5: CORVIDINHO_AUDIT_HMAC_KEY=…   # keys the audit chain (E.7)
# optional OPS-1/2: CORVIDINHO_BACKUP_DIR=/var/backups/corvidinho   # nightly DB backup + weekly restore test (E.7)
# LLM (AGENT-13; required — there is no built-in default model):
#   CORVIDINHO_LLM_MODEL=openai:<model> | ollama:<model> | anthropic:<model>  (bare = OpenAI-compatible)
#   openai: CORVIDINHO_LLM_API_KEY (or OPENAI_API_KEY), optional CORVIDINHO_LLM_BASE_URL
#   ollama: optional OLLAMA_HOST (default 127.0.0.1:11434), no key
#   anthropic: ANTHROPIC_API_KEY
#   CORVIDINHO_LLM_TIER=read|tool|code (default tool); CORVIDINHO_LLM_MODEL_READ/_TOOL/_CODE per tier
# optional SESSION-5: CORVIDINHO_LLM_CONTEXT_TOKENS=8192   # model window; long chats condense at ~80% of it
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
`CORVIDINHO_GITHUB_ALLOW_REPOS` / `_ORGS`. `doctor` also warns when no model provider is
usable (`[warn] llm: No model provider is configured …`, AGENT-10) and checks the data dir
is writable (`data-dir`). Its
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
| Allowlist file `[owner]` | `discord_id`, `github_id`, `github_login`, `display` | same file as `CORVIDINHO_ALLOWLIST_FILE` / `~/.config/corvidinho/allowlist.toml`; in a `.json` file, quote `discord_id` (JSON numbers lose snowflake precision). `github_id` (your numeric GitHub user id, `gh api users/<login> --jq .id`) is read from the file only |

- Matching is by Discord snowflake and, on GitHub, by the numeric user id (`[owner] github_id`)
  only — never by display name and never by GitHub login (IDENTITY-7.a: a renamed or
  re-registered login is someone else). Without `github_id` the owner is not recognised on
  GitHub (WATCH treats the login as an undeclared commenter; `corvidinho doctor` prints
  `[warn] people-github`); `github_login` is only used to @mention the owner there.
  The display name is shown in `doctor`, `/status` and `/admin config show`; ids are never printed.
- Declared people (IDENTITY-13/14): add `[people.<id>]` sections to the same file
  (`display`, `nicknames`, `discord_ids`, `github_logins`, `github_ids`; template in
  [`allowlist.example.toml`](../allowlist.example.toml)) or use `/admin people add|link|unlink|remove`
  (owner-only, SAFE-5 audited). Matched on Discord ids and GitHub numeric ids only, never names
  or GitHub logins (IDENTITY-7 / IDENTITY-7.a); an entry with `github_logins` but no `github_ids`
  still loads but is not recognised on GitHub until `/admin people link person:<id> github:<login>`
  (looks the numeric id up once and stores it) or `github_ids` in the file. Never changed through
  chat (IDENTITY-6). Read live, no restart. See [`discord.md`](discord.md) "Declared people".
- Roles (IDENTITY-8..12): give each declared person `role = "team"` or `role = "community"`
  (no `role` = community), or use `/admin people role` (owner-only, SAFE-5 audited). The owner
  is always owner; anyone undeclared is community. Only the owner and team can start `/work`
  (IDENTITY-11.a), so with no owner and nobody declared as team nobody can. See E.6.
- No owner, or a Discord id that is not a snowflake ⇒ **nobody is ADMIN** (IDENTITY-3).
  `doctor` shows `owner: configured: no`.
- An owner who is muted (`/mute`, `DISCORD_MUTED_USER_IDS`) or on `[discord].deny_users` is not ADMIN.
- `CORVIDINHO_DISCORD_ADMIN_USERS` / `_ROLES` grant nothing. The bridge logs a warning and
  `doctor` shows an `admin-lists` warning when they are set.
- Owner-only today: `/mute`, `/unmute`, `/admin …`, `/announce channel`, `/schedule create|pause|resume|delete`,
  memory forget/override (from the owner's chat once `CORVIDINHO_ALLOWLIST` names them, E.3, or
  `corvidinho plugins run` with the acting env set; see [`discord.md`](discord.md) Memory),
  reading someone else's memory (`memory-recall` / `memory-profile --person`, MEMORY-7; the owner
  gets it by direct message, never in the channel, MEMORY-7.a),
  mutating tools in a chat session (E.6),
  and the `/work` draft-PR step (E.3).
- Forget requests (MEMORY-ACL-6): anyone may ask the bot to forget them — on Discord, or on GitHub
  with a "forget me" comment to the watch user when they are a declared person matched by their
  GitHub account id (MEMORY-ACL-6.a; the watch process must share the bridge's data dir) — and the
  owner can start one for any declared person with `/admin people forget`; the bridge sends the
  owner a **direct message** with Approve / Deny buttons (no answer within 24 h is a no). The bot
  can DM the owner only when they share a server with it and accept DMs from its members (the
  server's Privacy Settings); until the card goes out the ask stays pending and then lapses as a
  no. No intent or portal toggle is needed. See [`discord.md`](discord.md) Memory.
- Approve / Deny cards and one-time codes (SAFE-18..20): every card (forget requests, and the
  must-ask cards below) comes from the running bridge by **direct message**, checked about every 5 seconds even with the
  scheduler off; a diff or text comes first, then the card with the exact action, target and
  amount. Destructive and money cards also need a **one-time code**: after **Approve** the bot DMs
  an 8-character code (valid once, for that card only, for 2 minutes) that you type with **Enter
  code**. Same DM rule as above; nothing to configure. With no bridge running no card goes out, and
  an unanswered card is a no. See [`discord.md`](discord.md) "Approve / Deny cards".
- Must-ask (AUTONOMY-9/10): prod and deploy contact (the VPS, secrets, env, DNS, deploy tools, a
  push to a remote's default branch or a usual default or deploy branch such as `main` — read-only
  looks included) and every `discord-post-message`
  post wait for your OK on one of those cards before they run (prod cards need the one-time code);
  a deny or no answer in 5 minutes runs nothing. Updating to a tagged release with
  `CORVIDINHO_REF=v<X.Y.Z> scripts/corvidinho-update.sh` in the installed checkout is not a deploy.
  Needs the bridge running and an owner configured; nothing else to set. See [`discord.md`](discord.md)
  "The must-ask list".
- Private reads by DM (MEMORY-7.a): private notes, profile reads (`memory-profile`) and the owner's
  view of someone's memory are sent to whoever asked by **direct message**; the channel gets only a
  short "sent privately" note. Same DM rule as above: the person must share a server with the bot
  and accept DMs from its members, or the note says it could not be sent (it is never posted in
  the channel instead).
- When a run asks for a human, a clarify question (AUTONOMY-1/4) pings the requester (the message
  author, or the schedule creator for a scheduled run); a stuck run (AUTONOMY-2, or a repeated
  failing call, AGENT-16) and a spend-cap stop (SAFE-8) ping the owner. A stuck WATCH (GitHub)
  run is sent to the owner by **direct message** on the bridge's next tick (AGENT-16.a; the watch
  process must share the bridge's data dir, and the owner must accept DMs from server members). With no owner a stuck question (or a spend-cap stop's "💸 Work is paused for budget.") still posts and the
  bridge logs
  `[discord] run needs a human but no owner is configured — owner ping skipped (AUTONOMY-2 / IDENTITY-3)`.
- A scheduled run's question blocks its schedule (AUTONOMY-6.a): its post carries **Choose** /
  **Answer** and **Cancel** buttons (a spend-cap stop: **Cancel** only) that the schedule's
  creator or the owner presses; a reply does not answer it, and the buttons do not expire while
  it is open. Until then the schedule's due runs are skipped (not made up) and one note says it
  is waiting. A schedule with no channel sends its question and buttons to the owner by **direct
  message** (same DM rule as above). See [`discord.md`](discord.md) "Scheduled questions wait for
  an answer".
- Spend is the owner's (SAFE-14.a): with `CORVIDINHO_DAILY_SPEND_CAP_USD` set, a run stopped at
  the cap posts only "💸 Work is paused for budget." (the owner pinged once per cap episode) —
  never the amounts, the cap or the setting name. The details (24 h spend, the next call's
  estimate, the cap, which setting to change) and the 80% warning go to the owner by **direct
  message** after each run and on every scheduler tick. Same DM rule as above: the owner must
  share a server with the bot and accept DMs from its members; until then the DM is kept and
  retried every tick, the bridge logs one
  `[discord] spend DM to the owner did not go out (SAFE-14.a) …` line per failure streak (no
  amounts), and the owner's `/status` spend line notes that a spend DM is waiting. `/status`
  shows the spend line to the owner only; anyone else sees just "Spend: Work is paused for
  budget." while runs are stopped at the cap.

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
`corvidinho plugins run` run the tool and offers it to the model in the owner's runs;
`shell-exec`, the runners and the Fledge core runs `fledge-lanes-run` / `fledge-run` only in
the owner's own chat, `/session start`, `/work` and their ask answers, inside that talk's own
worktree (SAFE-3.a, see "What an entry unlocks" below):

| Tool | dangerous | minTier | mutating | Allowlist it when |
|------|-----------|---------|----------|-------------------|
| `web-fetch` | true | 1 | true | an operator runs `corvidinho plugins run web-fetch` non-interactively (GET-only, SSRF-guarded, SAFE-7) |
| `fledge-<command>` | true | 2 (native) / 1 (wasm without `exec`) | true | an operator runs `corvidinho plugins run fledge-<command>` non-interactively; one entry per Fledge command you trust, names from `plugins list` (a Fledge plugin command named `run`, `lanes-list`, `lanes-validate` or `lanes-run` is skipped: the Fledge core builtins `fledge-run`, `fledge-lanes-list`, `fledge-lanes-validate` and `fledge-lanes-run` hold those names) |
| `fledge-lanes-run` / `fledge-run` | true | 2 | true | an operator runs `corvidinho plugins run fledge-lanes-run -- <lane>` or `fledge-run -- <task> [args…]` non-interactively; builtins that run fledge's own `lanes run` / `run` in the project dir (PLUGIN-1), so they run whatever that lane or task's commands do, starting without the owner's GitHub or git credentials like `shell-exec` and the runners (SAFE-21.a), so pushes, PRs and merges go through the checked GitHub tools; the model gets them only in the owner's own chat, `/session start`, `/work` or ask answer, inside that talk's own worktree, at code tier (SAFE-3.a) |
| `git-commit` | true | 2 | true | `/work` should open draft PRs (needed when the work tree has changes) |
| `git-push` | true | 2 | true | `/work` should open draft PRs; the remote's OWNER/REPO must also pass the GitHub allowlist (GITHUB-6) |
| `github-pr-create` | true | 1 | true | `/work` should open draft PRs; needs `GITHUB_TOKEN`/`GH_TOKEN` |
| `git-branch-create` | true | 2 | true | an operator runs `corvidinho plugins run git-branch-create` non-interactively (`/work` does not need it: the worktree makes the branch) |
| `shell-exec` | true | 2 | true | an operator runs `corvidinho plugins run shell-exec` non-interactively (cwd clamped to the project, `env -C` and symlinks included, SAFE-3; refuses `sed -i` / `>` edits, downloads piped into a shell, deletes outside the worktree and secret reads, saying why, SAFE-21; starts without GitHub or git credentials, so pushes, PRs and merges go only through the typed GitHub tools, SAFE-21.a; 10 minute timeout, 64 KiB output cap, output scrubbed); the model gets it only in the owner's own chat, `/session start`, `/work` or ask answer, inside that talk's own worktree, at code tier (SAFE-3.a) |
| `node-exec` / `python-exec` / `cargo-exec` | true | 2 | true | an operator runs `corvidinho plugins run <name>` non-interactively; each is registered only when `node` / `python3` (else `python`) / `cargo` is on PATH (PLUGIN-4), runs that binary with argv only (no shell) starting in the project dir (a start dir, not a clamp: the code it runs can `chdir` elsewhere) without GitHub or git credentials (SAFE-21.a), and `plugins list` names any that are not loaded; the model gets them only in the owner's own chat, `/session start`, `/work` or ask answer, inside that talk's own worktree, at code tier (SAFE-3.a) |
| `memory-forget` | true | 1 | true | the owner's chat should forget memories on request, or an operator runs `corvidinho plugins run memory-forget` non-interactively with the acting env set (two-phase confirm, SAFE-4), see [`discord.md`](discord.md) Memory |
| `memory-override` | true | 1 | true | the owner's chat should correct memories on request, or an operator runs `corvidinho plugins run memory-override` non-interactively with the acting env set (two-phase confirm, SAFE-4), see [`discord.md`](discord.md) Memory |
| `files-delete` | true | 2 | true | an operator runs `corvidinho plugins run files-delete` non-interactively (SAFE-2 protected paths always refused) |
| `github-issue-create` / `github-issue-comment` / `github-pr-review` | true | 1 | true | the owner's runs should open issues, comment or review PRs (GITHUB-1/3), or an operator runs `corvidinho plugins run <name>` non-interactively; team members' Discord runs get `github-issue-comment` and `github-pr-review` too, on GITHUB-6-allowlisted repos only (IDENTITY-10, E.6) |
| `discord-post-message` | true | 1 | true | an operator runs `corvidinho plugins run discord-post-message` non-interactively to post to an allowlisted channel (DISCORD-5/8); in the owner's runs the model can post too, and only where the owner could post themselves (the DISCORD-8 check is for the acting user; needs Server Members Intent). Every post, the operator's included, first waits for the owner's OK on a DM Approve card (AUTONOMY-10.a; needs the bridge running and an owner configured) |
| `discord-send-file` | true | 1 | true | the owner's runs should attach files and images (screenshots, logs, diffs, charts) to their replies (DISCORD-17); always in the conversation's own channel, which the bridge sets (no `--channel`), only where the owner could attach files themselves (DISCORD-8 with Attach Files; needs Server Members Intent), 8 MB and a png/jpeg/gif/webp + txt/log/md/diff/patch/json/csv allowlist, text secret-scrubbed, SAFE-2 protected and secret paths refused, see [`discord.md`](discord.md) Files and images in replies |
| `specsync-change-approve` / `specsync-change-finalize` | true | 2 | true | on Corvidinho itself, the run should approve and archive (check, review, finalize) the SpecSync change it opened, right after its verify lane is green, then verify again (AGENT-18.a). Never offered to the model: the run takes these steps itself, in owner runs and team `/work` runs only, never in WATCH, schedules or workers. In any other repo they refuse (`refused: in this repo a human approves, reviews and finalizes SpecSync changes (AGENT-18.a) …`) and the run says the change stays open for a human |
| `danger-ping` | true | 1 | true | only to test the deny path (no-op) |

Not dangerous, but mutating (no allowlist entry needed; owner-only under ROLES-CHAT, E.6, except
that a team member's `/work` run gets `files-write` / `files-edit` and the SpecSync change tools, IDENTITY-10):
`files-write` (minTier 2), `files-edit` (minTier 2), `specsync-change-new` and `specsync-change-answer`
(minTier 2; they open and answer a SpecSync change where the project's SpecSync change workflow is on,
and in a hi repo an `acceptance_criteria` answer must cite captured hi ids, AGENT-18), `delegate` and
`council` (minTier 2, autonomous extras, E.5). `specsync-change-status` is read-only.

`minTier` is the capability tier the model needs to see the tool: `1` = `tool`, `2` = `code`
(`CORVIDINHO_LLM_TIER`). `mutating` = dangerous or explicitly marked mutating (ROLES-CHAT-5).

What an entry unlocks **today**:

- `corvidinho plugins run <name>` with `--non-interactive` or `CORVIDINHO_NON_INTERACTIVE=1`.
- The bridge's `/work` draft-PR step: `git-commit` (when the tree is dirty), `git-push` and
  `github-pr-create`. Without them the reply says
  `not opened — opening a PR from /work needs an explicit allow (GITHUB-5): allowlist … (CORVIDINHO_ALLOWLIST)`
  and the changes stay on the work branch. The PR step also needs verify to pass (with a test
  summary showing tests ran), no test deleted or turned off since the branch left its base
  (AGENT-15), in a repo whose SpecSync workflow requires a change for meaningful files every such
  path changed on the branch covered by a SpecSync change (AGENT-18), the requester
  to be the owner or a declared team member (only they can start `/work`, IDENTITY-10/11.a),
  and the repo to pass GITHUB-6.
- The model's tool catalog in `task run` (CLI-3 / SAFE-1). A dangerous tool is offered to the
  model only when the run's `CORVIDINHO_ALLOWLIST` names it and its `minTier` fits the run's
  tier; an unlisted one stays out, and a call to a tool that is not offered is refused. Role
  gates are unchanged: only ADMIN runs (the owner's Discord chat, `/session start` and `/work`)
  and a local `corvidinho task run` get them; non-owner chats, WATCH, schedules and council
  voices never do (E.6). A `delegate` worker gets the lead's effective allowlist (never a wider
  one), so a worker of a local run is offered the same tools, and a worker of a role session is
  non-ADMIN and offered none.
- The shell, the runners and the Fledge core runs (SAFE-3.a): `shell-exec`, `node-exec`,
  `python-exec`, `cargo-exec`, `fledge-lanes-run` and `fledge-run` reach the model's catalog
  only when all of these hold, checked again at every attempt of the run:
  - the allowlist names the tool, and the run is at code tier (`CORVIDINHO_LLM_TIER=code`, or
    `--tier code`; at the default `tool` tier they are never offered);
  - the run is the owner's own chat message, `/session start`, `/work`, or an ask-button pick
    or Answer form that continues one of those talks (the spawn stamps an internal
    `CORVIDINHO_ACTING_SURFACE` that you never set yourself); WATCH runs, schedules, non-owner
    runs (team included), a muted or deny-listed owner and `delegate` / `council` workers never
    get them;
  - the run's directory is that talk's own linked git worktree (`talk-…` under the worktree
    base). A non-git project (its scoped folder), the main checkout and another talk's
    worktree are refused.
  A local `corvidinho task run` does not get them yet: it runs in the current checkout, not a
  talk worktree of its own. When the allowlist names one of them and the run is refused, the
  run's event stream carries one `[operator] SAFE-3.a: … allowlisted but not offered: <why>`
  line (never part of the reply). Every call still goes through the role re-check, SAFE-1,
  the must-ask Approve card for prod and deploy commands (AUTONOMY-9), the SAFE-5 audit trail
  and the tools' own SAFE-3 clamp, SAFE-21 refusals and credential-free env (the Fledge runs
  included: no GitHub tokens, no global git config or credential helper, no ssh agent, gh
  logged out). Known limits: the runners' own code (and a Fledge lane or task) can still
  change directory, read files or write files inside or outside the worktree as the bot's own
  user, which no lexical check sees; keep the allowlist file and other secrets outside every
  talk worktree.
  They all still run through `corvidinho plugins run`.
- Fledge commands (`fledge-<command>`) are discovered for a run only when the allowlist names
  one and the run is not a non-ADMIN session. Naming a Fledge core builtin (`fledge-lanes-list`,
  `fledge-lanes-validate`, `fledge-lanes-run`, `fledge-run`) starts no discovery. Fledge
  commands can change files without reporting them, so in a project that is not a git work
  tree a run that called one, or a local run's `delegate` worker (which could have), runs the
  verify lane anyway (AGENT-4). So does a run whose `delegate` worker ended without its result
  (stopped at its timeout, crashed, or never started), since its edits reached the lead nowhere.
- Allowlisting `git-commit`, `git-push` and `github-pr-create` for the `/work` PR step also
  offers them to the owner's runs, so the model can commit, push or open a PR itself before the
  run's verify.

### E.4 `corvidinho daemon` under systemd (CLI-8, AUTONOMOUS-4)

Run the daemon when schedules should tick without the bridge. Full guide and unit file:
[`DAEMON.md`](DAEMON.md). What an operator needs to know:

- It uses the bridge's environment and adds no variables: `CORVIDINHO_DATA_DIR`,
  `CORVIDINHO_BIN`, the allowlists, the model (`CORVIDINHO_LLM_MODEL`) and its key (E.9), and `CORVIDINHO_BACKUP_DIR` when the nightly
  backup is on. Put them in the unit's `EnvironmentFile` (mode 600, not in git).
- One daemon per data dir: `<data dir>/daemon.lock`. A second one logs `daemon.lock_held` and exits 1.
- It can run next to the bridge on the same DB. Each due run is claimed once. Runs the daemon
  claims are recorded in the run history; the daemon itself never posts to Discord. A daemon
  run that stops to ask a human (stuck, clarify, spend cap) keeps its question on the run row,
  and the bridge's next scheduler tick posts it to the schedule's channel once (see
  [`DAEMON.md`](DAEMON.md)).
- Scheduled runs are never ADMIN (read/chat tools only, E.6) and always non-interactive (E.3).
- Scheduled runs read and act only on GitHub-allowlisted repos, even public ones
  (DISCORD-SCHEDULE-3.a): the GitHub tools refuse any other repo, `web-fetch` refuses GitHub
  URLs outside the allowlist (every redirect too), and a schedule's project inside the bridge
  root that is its own git checkout needs an allowlisted origin. An existing schedule on such
  a checkout off the allowlist starts failing at its next tick: allowlist the repo or delete
  the schedule.
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

### E.6 Roles: owner, team, community (IDENTITY-8..12, ROLES-CHAT)

Who is who in an allowlisted channel:

- Owner ⇒ ADMIN (unless muted or on `deny_users`): every tool, still behind SAFE and the
  allowlists (IDENTITY-9).
- A declared person with `role = "team"` ⇒ **team** (IDENTITY-10), in Discord chat, button picks,
  `/session start` and `/work`: the read tools below plus `github-issue-comment` and
  `github-pr-review` (still allowlisted in `CORVIDINHO_ALLOWLIST`, and only on repos the
  GITHUB-6 `[github]` allowlist admits; their reviews post as `COMMENT`, while `APPROVE` and
  `REQUEST_CHANGES` stay the owner's), plus `files-write` / `files-edit` in their `/work`
  run's own worktree (never on a secret-looking path); their `/work` can open the draft PR
  like the owner's. Memory stays their
  own (`memory-store` / `-recall` / `-profile`; forget/override stay owner-only), plus the
  project's memory (`--project`, MEMORY-6). No shell, runners, git
  writes, other GitHub writes, Discord posts, `web-fetch`, `delegate` or `council`. Briefings
  (#102) do not exist yet.
- Everyone else ⇒ **community**: declared `community`, declared without a role, undeclared,
  muted or deny-listed (IDENTITY-11/12). Muted users are refused (the mute and rate gate runs on
  chat and on every slash command). Community can't start `/work` (IDENTITY-11.a).
- WATCH runs, scheduled runs and `delegate` / `council` workers are community whoever triggered
  them.
- The role is re-read from the people list on every tool call (IDENTITY-12): a
  `/admin people role` change or a VM edit applies to the next call, no restart.
- `[discord].users` / `.roles` / `deny_users` / `deny_roles` gate every @mention, reply-to-bot,
  thread continuation and slash command, after the channel gate. A user on `deny_users` or
  holding a `deny_roles` role is refused (deny always wins). Once `users` or `roles` has
  entries, only listed users, holders of a listed role and the owner pass (`/admin users add`
  warns when it adds the first user); with both empty, anyone in an allowlisted channel may
  chat. A refused chat message gets no reply, session or run; a refused slash command gets only
  an ephemeral zero-width ack.

Community sessions (every non-owner who is not team, plus all WATCH and scheduled runs):

- **Catalog:** only read/chat tools. No dangerous or mutating tool is offered, so no file
  write/edit/delete, no shell, no git/GitHub writes, no Discord posts, no memory
  forget/override, no `delegate`/`council`, no `web-fetch` (dangerous counts as mutating).
  Read tools stay, including `files-read`/`-list`/`-glob`, `search-grep`,
  `git-status`/`-diff`/`-log`/`-branch-list`, GitHub reads, `specsync-*` reads,
  `fledge-lanes-list`/`-validate`,
  `memory-store`/`-recall`/`-profile` (scoped to the acting person; no project memory — a
  GitHub WATCH run acts for the commenter's declared person and reads its thread repo's
  project memory, read-only, MEMORY-8),
  `memory-forget-me` (asks the owner, MEMORY-ACL-6), `discord-user-lookup` (members of
  the configured `DISCORD_GUILD_ID` only, IDENTITY-5) and `plugins-list`.
- **Run time:** a mutating call the model makes anyway, including one to a tool it was never
  offered, is refused with `not allowed for your role` (ROLES-CHAT-3) and nothing runs. The
  refusal is not posted on its own; the reply ends with a short `(not allowed for your role)`
  line instead, kept when a long reply is cut to fit: chat replies, `/session start` and
  `/work` answers, schedule posts and the run history they come from, a reply shortened for
  a SAFE-13 owner line or a slash owner notice, and the WATCH summary comment all lose the end of the text,
  never the line. A run that ends by asking a question
  posts the question, which can leave the line out. A call to a name that is not a plugin at
  all keeps the plain "not offered" refusal and adds no line. ADMIN is re-checked on every
  call against the live owner config; the prompt never grants it.
- **Public Q&A (ROLES-CHAT-8):** GitHub reads work for any **public** repo. Private repos, and
  repos whose visibility cannot be confirmed, are refused; deny lists still win. Scheduled
  runs read only public repos that are also on the GitHub allowlist (DISCORD-SCHEDULE-3.a). Secret-looking
  paths (`.env*`, `.ssh`, keystores, `credentials`, `id_rsa`, `id_ed25519`, `*.pem`) are
  refused when named to `files-read`, `files-list`, `search-grep` or `git-diff`, and left out
  of `files-glob` / `files-list` results, recursive `search-grep` output and `git-diff`.
  Team sessions get the same secret-path refusals.
- **Site and roadmap (ROLES-CHAT-8.a):** only the public repo docs (README, `docs/`, STATUS,
  CHANGELOG — `github-docs-read`, or the project files) and the public issues and milestones
  of allowed public repos (`github-issue-list`, `github-milestone-list`). No site URL is a
  source (`web-fetch` is never offered to community).
- `/session start` runs for community too, as a read-only session. `/work` does not
  (IDENTITY-11.a): a community member, or anyone undeclared, gets the ephemeral
  `not authorized` and nothing starts — no worktree, branch, work task, run or PR.
- The owner keeps the GitHub allowlist (GITHUB-6) and still passes every SAFE gate.
- A local `corvidinho task run` in a shell has no role session, so these gates do not apply
  there. The bridges always set `CORVIDINHO_ACTING_IS_ADMIN` to `0` or `1` for their runs, and
  the Discord bridge `CORVIDINHO_ACTING_ROLE` (`owner` / `team` / `community`, the most that
  surface allows), `CORVIDINHO_ACTING_WORK_TASK` (`1` for `/work`) and
  `CORVIDINHO_ACTING_SURFACE` (`chat`, `ask`, `session`, `work`, `schedule`; WATCH sets
  `watch`); all are internal and always overwritten, and the tool layer never trusts them to
  raise a role (the surface only narrows who gets the shell, SAFE-3.a).

### E.6.a Untrusted text and injection attempts (SAFE-11/12/13, SAFE-12.a)

Nothing to configure; it is always on (details in [`discord.md`](discord.md) "Untrusted
text and injection attempts").

- Discord names (the speaker's, and `discord-user-lookup` results) are cleaned before the model
  sees them, and a name that imitates the owner's or a declared person's is flagged as someone
  else. Identity and role come only from declared ids.
- A non-owner's message, `/session start` topic, `/work` description, answer typed in an
  ask's private Answer form and picked Choose label (SAFE-12.a), WATCH titles and bodies, and
  GitHub / guild-member tool results reach the model fenced as untrusted data. A Choose press
  whose option the ask doesn't have gets "that choice expired" and runs nothing.
- A non-owner message (an Answer form answer included: private refusal, question kept open,
  owner pinged in the channel) or WATCH event that looks like an injection attempt gets one short reply
  (Discord) or comment (GitHub) and no run; the owner is pinged on Discord, or @mentioned on
  GitHub when `[owner] github_login` / `CORVIDINHO_OWNER_GITHUB_LOGIN` is set. A tool result
  that looks like one (also one a `delegate` / `council` worker read) turns the run's mutating
  tools and `memory-store` off for the rest of that run and pings the owner on the answer. Each hit is an `injection-suspected` audit row (E.7).
- Without an owner the refusal still goes out (it says nobody could be told) and the bridge
  logs `[discord] SAFE-13 refusal but no owner is configured`.
- Schedules: a non-owner's `/schedule create` whose name or prompt looks like an injection
  attempt stores nothing (private refusal, the owner pinged in the channel). Each tick fences a
  non-owner's stored name and prompt with the creator's current role, and stored text that
  looks like an injection is not run: the schedule is paused and the owner pinged once in its
  channel. The owner's own schedules are unchanged.

### E.7 Where the logs and the audit trail live

All paths default to the data dir `~/.local/share/corvidinho` (`CORVIDINHO_DATA_DIR`).

| What | Where | How to read |
|------|-------|-------------|
| SAFE-5 audit chain (dangerous plugin runs incl. denials, `/admin` mutations, `/schedule delete`, SAFE-13 `injection-suspected` refusals) | table `audit_log` in `<data dir>/corvidinho.db` (append-only; rows hold action, actor, surface, args digest, outcome, exit code, never raw args) | bridge start log `[discord] Audit: N entries · chain OK (keyed)`, `/status`, `/admin config show`; or any SQLite client, e.g. `sqlite3 ~/.local/share/corvidinho/corvidinho.db 'SELECT seq, ts, action, actor, surface, outcome, exit_code FROM audit_log ORDER BY seq DESC LIMIT 20'` |
| Audit key | `CORVIDINHO_AUDIT_HMAC_KEY` (env only, never in the DB) | set the **same** key on every process that shares the data dir; without it the chain is plain SHA-256 and the line says `unkeyed — set CORVIDINHO_AUDIT_HMAC_KEY`. Once the chain holds a keyed row, a process without the key refuses dangerous plugin runs, `/admin` changes and `/schedule delete` (`audit log unavailable … (SAFE-5)`), and an unkeyed row after a keyed row reads as `chain BROKEN at #N`. Without the key, a tampered unkeyed row before any keyed row still reads `chain BROKEN at #N` (no key is needed to see it); only reaching a keyed row reads `cannot verify keyed rows (CORVIDINHO_AUDIT_HMAC_KEY not set)` |
| WATCH spawn outcomes | `<data dir>/watch-spawn.jsonl` (override `CORVIDINHO_WATCH_SPAWN_LOG`) plus `[watch] spawn start …` / `[watch] spawn outcome …` lines on stdout | one JSON object per run: start/finish time, repo#number, exit code, error class, duration |
| Daemon | JSON lines on stdout (journald under systemd) | `journalctl -u corvidinho-daemon -o cat \| jq 'select(.event == "run.finished")'` |
| Bridge | stdout/stderr (`[discord] …`): journald under systemd, or `/tmp/corvidinho-discord-bridge.log` (`CORVIDINHO_BRIDGE_LOG`) when `scripts/corvidinho-update.sh` starts it in pidfile mode | protocol check, audit line, admin-list and owner warnings |
| Schedule run history | tables `schedules` / `schedule_runs` in `corvidinho.db` | `/schedule list` (last run, run count); the daemon's `run.finished` events |
| Discord sessions and `/work` tasks | tables `discord_sessions` / `discord_work_tasks` in `corvidinho.db` | `/session list`, `/status` |
| Per-session worktrees | `.corvid-worktrees` next to the project (override `WORKTREE_BASE_DIR`) | `git worktree list` in the project |
| Nightly backup (OPS-1/2) | `corvidinho-<UTC time>.db` snapshots in `CORVIDINHO_BACKUP_DIR` (unset = no backup; mode 0600, newest 7 kept); state in `schema_meta` `ops_*` keys | `corvidinho doctor` (`backup` line: snapshots, last backup / restore test, failure reason, whether the owner was told), `corvidinho backup list`; events `backup.ok` / `backup.failed` / `restore_test.ok` / `restore_test.failed` in the daemon log or `[backup] …` bridge lines. Restore: stop the bridge and daemon, then `corvidinho backup restore <snapshot> <data dir>/corvidinho.db --force` ([`DAEMON.md`](DAEMON.md#nightly-backup-ops-12)) |

Free-text columns in `corvidinho.db` and every string value in the daemon's log lines are
scrubbed for secrets before they are written (SAFE-6). The audit chain stores an args digest,
never the args.

### E.8 Persona file (PERSONA-1..3)

Corvidinho's voice is `persona.md` at the root of the corvidinho checkout whose `src/cli.ts`
runs the task (`CORVIDINHO_BIN`; by default the checkout the bridge, WATCH and daemon run from),
never the project a run works in. Every run reads it again (chat, slash commands, `/work`,
schedules, WATCH, `task run`, delegate and council workers), so the next turn after an update
uses the new text; no restart and no setting. It goes into the system prompt first, and
Corvidinho's rules follow it and win (one message per turn, no spam, no unchecked claims).
Fixed-text bot posts (the bridge-live note, `/status`, error and spend lines) do not go through
the model and keep their text. The bridge-live note in the `/announce` channel is written in the
persona's voice: one short line with the version and a link to its GitHub Release notes, never a
changelog bullet list (PERSONA-1.a); editing `persona.md` does not change it.

- Only the copy committed at `HEAD` is loaded. `scripts/corvidinho-update.sh` checks out the
  merged ref, so change the voice with a PR like any other file; a hand edit on the VM is not
  loaded.
- Capped at 8 KiB (longer is cut with a marker) and scrubbed for secrets (SAFE-6). Never put
  tokens, keys or private paths in it.
- Missing, empty, refused (for example untracked), truncated, or edited but not committed: the
  run goes on (with no persona when none loaded) and emits one `Persona: …` note naming only the
  file, for example "working-tree changes not loaded". It is a `Text` event in the run's output:
  `bun src/cli.ts task run` prints it on stderr and `--json` / NDJSON carry it; the bridges and
  WATCH do not post it to Discord or GitHub.

### E.9 Models: you configure them; there is no default (AGENT-13, AGENT-10)

**Upgrading:** Corvidinho no longer falls back to `gpt-4o-mini` and has no demo stub. A box that
set only `CORVIDINHO_LLM_API_KEY` / `OPENAI_API_KEY` must now also set `CORVIDINHO_LLM_MODEL`
(for the old behaviour, `CORVIDINHO_LLM_MODEL=gpt-4o-mini`), then restart the bridge, `github
watch` and the daemon. Until a model is set, every run fails instead of answering, and the places
below say why.

`CORVIDINHO_LLM_MODEL` (and the optional per-tier `CORVIDINHO_LLM_MODEL_READ` / `_TOOL` /
`_CODE`, AGENT-5) holds `kind:model` entries. Every kind speaks the OpenAI-compatible chat API
and goes through the same SAFE-8 spend cap:

| Kind | Example | Endpoint | Key |
|---|---|---|---|
| `openai` (or no prefix) | `openai:gpt-4.1`, `gpt-4o-mini` | `CORVIDINHO_LLM_BASE_URL` (default `https://api.openai.com/v1`; any OpenAI-compatible gateway) | `CORVIDINHO_LLM_API_KEY` or `OPENAI_API_KEY` |
| `ollama` | `ollama:qwen3:30b` | `OLLAMA_HOST` (default `127.0.0.1:11434`), its `/v1` API | none |
| `anthropic` | `anthropic:<model>` | `https://api.anthropic.com/v1` (Anthropic's OpenAI-compatible API) | `ANTHROPIC_API_KEY` |

A prefix that is not one of these kinds is part of the model name (`qwen3:30b` is an
OpenAI-compatible model). A headless agent CLI as a model is not built yet.

A comma list is a fallback chain (AGENT-11), e.g.
`CORVIDINHO_LLM_MODEL=openai:gpt-4.1,anthropic:claude-sonnet-5,ollama:qwen3:30b`. A run calls the
first entry; when that model fails — an HTTP error (404 or 410 for a retired or missing model
included), a network error, a timeout (the 10-minute request cap) or a malformed reply — it goes
on at once with the next entry, with no retry or backoff, and keeps that model for the rest of
the run (later rounds, verify retries). A next entry whose key is not set is skipped the same
way. Nothing is remembered between runs: each `task run` process tries the first entry once
again. A stop at the spend cap is not a model failure: the run stops and asks (SAFE-8) and never
routes around the cap to another model; a Deny or a lapsed card on a tool is the tool's answer,
and your own stop is a stop. It tells you on every surface:

- the run's answer ends with a note that clips and message splits keep, e.g.
  `(model fallback: gpt-4.1 failed (HTTP 404), fell back to anthropic:claude-sonnet-5)`
  (chat, button answers, `/session start`, `/work`, schedule posts, WATCH comments, `task run`);
- `task run` prints `[operator] gpt-4.1 failed (HTTP 404); falling back to anthropic:claude-sonnet-5`
  as it happens (a `Text` frame in `--output ndjson`); its result (`--json`, the NDJSON `result`
  frame) carries `model` (the one that answered), `usageByModel` and `modelFallback`, and each
  NDJSON `usage` frame names its `model` and the running `byModel` totals;
- the Discord answer footer names the model that answered, `anthropic:claude-sonnet-5 (fell back
  from gpt-4.1)`; on your own runs the cost prices each model's tokens at its own price (a model
  with no known price makes it `cost unknown`); everyone else sees model and time only;
- every run that fell back (yours too) also logs one warn line, which is how you hear of one in a
  run that is not yours (someone else's chat, WATCH, a schedule): the
  bridge `[discord] llm.fallback: …`, `github watch` `[watch] llm.fallback: …`, the daemon an
  `llm.fallback` event. There is no DM for it.

A `delegate` or `council` worker that fell back is reported by its lead the same way, marked
`delegate worker:` / `council worker:`. The fallback order is yours: there is no ranking by
price or benchmark and no setting beyond the list itself.

With no usable model for a tier (nothing set, or its first entry's key is missing) it says so:

- at startup: a `[discord] No model provider is configured …` line from the bridge, a
  `[watch] …` line from `github watch` (not in a dry run), an `llm.no_provider` warn line and
  `llm: "none"` on `daemon.started`, and the first stderr line of `task run`;
- in `/status`: `LLM: none — …`. The owner sees which tier and what to set; anyone else sees
  only `No model provider is configured.` (no setting names, like the spend line, SAFE-14.a);
- in `doctor` and `init`: `[warn] llm: No model provider is configured …` (never fails them);
- in the runs themselves: a run on that tier calls nothing and ends failed with the notice as its
  result. `task run` prints it, and a WATCH run's summary comment carries it; Discord chat,
  button answers, `/session start`, `/work` and schedules post their usual `… failed (exit 1)`
  reply, like any failed run, so check `/status` or the start-up line.

Keys stay in the environment and are never printed; `ANTHROPIC_API_KEY` is scrubbed from
error lines like the other LLM keys and never reaches the verify lane or a shell (SAFE-6).
