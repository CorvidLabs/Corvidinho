# Changelog

## 0.0.24

### Discord ask UX tighten (less duplicate noise)

- **DISCORD-ASK-6** — Button asks collapse the thinking embed into one public **Choose** stub (no separate "Needs your input" + stub).
- **DISCORD-ASK-7** — On success (mention done or after a button pick), edit the existing stub/thinking message into the final answer when practical — no extra ✅ Done + new reply.
- Ephemeral Choose → options flow unchanged (DISCORD-ASK-1..5).
- Live gateway: `editMessage` / `deleteMessage`; interaction replies use `MessageFlags.Ephemeral` (drops deprecated `ephemeral: true` warning).

### Ops

- Package version **0.0.24** — restart the Discord bridge after update. No schema bump.

## 0.0.23

### Stop means stop — child process trees (AGENT-3)

- **Process-tree kill + Fledge scoping** — [#185](https://github.com/CorvidLabs/Corvidinho/pull/185) (#112): Fledge runs, delegate workers and spawned chat/schedule agents get their own process group; a timeout, abort, parent exit or unhandled SIGINT/SIGTERM/SIGHUP kills the whole tree (including `setsid` grandchildren found via `/proc`), and signals the process started with ignored (SIGHUP under `nohup`) stay ignored. Daemon shutdown now kills runs abandoned after the grace period (CLI-8 / AUTONOMOUS-4). Model argv goes after `--` in `fledge plugins run`, and Fledge commands are bound to the project root they were discovered for (FLEDGE-4, PLUGIN-2/3).

### Security fixes

- **SAFE-3 `cd` clamp** — [#187](https://github.com/CorvidLabs/Corvidinho/pull/187): `shell-exec` refuses `cd -`, `cd -P /`, `cd -- /etc`, `{ cd /; }`, keyword forms, `pushd`, `builtin`/`command cd`, `eval "cd …"` and `CDPATH` tricks that escaped the project root.
- **`files-edit` literal `--new`** — [#188](https://github.com/CorvidLabs/Corvidinho/pull/188): `$&`, `$1`, `` $` ``, `$'` and `$$` in the replacement are written literally instead of being expanded.
- **Scrub before clip** — [#190](https://github.com/CorvidLabs/Corvidinho/pull/190) (SAFE-6): run summaries are secret-scrubbed before every length cap (500/1800/4000), so WATCH GitHub comments, spawn JSONL and Discord replies cannot leak a token or private key cut in half; a `BEGIN … PRIVATE KEY` block with no END line is now redacted (scrub rules version 2 re-scrubs stored rows once).
- **GitHub gate reads the allowlist file** — [#191](https://github.com/CorvidLabs/Corvidinho/pull/191) (GITHUB-6): `deny_repos` / `deny_orgs` in the allowlist file now apply to every GitHub plugin command and `/work` PRs, not only env overlays; the test suite never reads the operator's real allowlist file.

### Ops

- Package version **0.0.23** — restart the Discord bridge, `corvidinho daemon` and watch after update. No schema bump (still v8). Bridge chat agents now run in their own process group and are killed when the bridge exits.


## 0.0.22

### Ephemeral Discord button asks + multi-user sessions

- **DISCORD-ASK-1..5** — Clarify/stuck choices that fit a short list use Discord **buttons** (ephemeral choice UI). Public channel gets a short Choose stub (no MCQ spam); the requester presses Choose to see options privately. Button prompts expire after ~30 minutes; late press → `that choice expired`. Free-text ask-ping remains when options cannot be listed.
- **SESSION-MULTI-1..4** — Concurrent users in one channel each keep their own session (user id + channel). Reply/thread continue only for the session owner. Chat while buttons are open continues the conversation without clearing the pending ask; memory stays scoped to the acting Discord user.
- **ask-human** — Optional `options` array (or numbered choices in the question) drives the button UI.

### Ops

- Package version **0.0.22** — restart the Discord bridge after update. No schema bump (pending_ask JSON gains askId/expiresAt/options; still schema v8).


## 0.0.21

### Security and correctness sweep (bug-fix PRs from an adversarial bug hunt)

- **Discord actor gating** — [#176](https://github.com/CorvidLabs/Corvidinho/pull/176): chat and slash actors are checked against the user/role allowlist and deny lists (deny wins), not only the channel allowlist.
- **`/work` and `/session start` project option** — [#177](https://github.com/CorvidLabs/Corvidinho/pull/177): the `project` option can no longer point the agent at an arbitrary git repo on the host; only configured project roots resolve.
- **Schedules get their own worktree and branch; branches with commits are never force-deleted** — [#178](https://github.com/CorvidLabs/Corvidinho/pull/178): schedule run worktree ids no longer collide, and branch cleanup deletes a branch only when it has no commits of its own, whatever the default branch is called (`trunk` included).
- **Soft-TTL purge never parks a live session** — [#179](https://github.com/CorvidLabs/Corvidinho/pull/179): `/status` or `/session list` can no longer park the worktree out from under a running agent.
- **Spawned Bun config pinned** — [#182](https://github.com/CorvidLabs/Corvidinho/pull/182): a planted `bunfig.toml` preload in a project cannot run code in the agent child.
- **Image attachments saved inside the session root** — [#183](https://github.com/CorvidLabs/Corvidinho/pull/183): the agent can read what you attach.
- **Files path clamp follows dangling symlinks** — [#184](https://github.com/CorvidLabs/Corvidinho/pull/184): `files-write` cannot escape the root or create SAFE-2 protected files through a dangling link.
- **`--`-prefixed argv tokens kept** — [#186](https://github.com/CorvidLabs/Corvidinho/pull/186): file content, grep patterns and shell command flags that start with `--` survive; `files-write` refuses to empty a non-empty file without `--allow-empty`.

### Features and hardening

- **Council tool** (AUTONOMOUS-6, SAFE-9) — [#180](https://github.com/CorvidLabs/Corvidinho/pull/180) (#118): a code-tier lead in an autonomous-enabled project can convene a council that deliberates in phases (propose → critique → decide). Hidden unless allowed; ADMIN-only under ROLES-CHAT; voices run non-ADMIN; depth-0 leads only.
- **`/admin` and `github-pr-diff` edges** — [#175](https://github.com/CorvidLabs/Corvidinho/pull/175) (#43, #93): admin mutations fail closed without an audit trail; dangling/looping allowlist symlinks refused before any write; empty `--file` refused before any GitHub call.
- **Operator guide** — [#181](https://github.com/CorvidLabs/Corvidinho/pull/181): `docs/DISCORD-GO-LIVE.md` and `docs/BOX-UPDATE.md` document every shipped go-live knob (owner/ADMIN, protocol, restart-together, SAFE tiers, plugin flags).

### Ops

- Package version **0.0.21** — restart the Discord bridge (and `corvidinho daemon` / watch if running) after update. No schema change since 0.0.20 (still v8).

## 0.0.20

### Autonomy clarify UX — AUTONOMY-4..7

- **AUTONOMY-4** — Clarify asks ping the **requester** (message author / schedule creator). The configured owner is pinged only for **stuck** (verify/help), or when the requester is the owner.
- **AUTONOMY-5** — While a session waits on an ask, thin replies (`ok`, `k`, `sure`, `hmmm`, emoji-only, …) do **not** clear blocked or mark done; the bridge restates the pending question once (no vacuous “ready when you are”).
- **AUTONOMY-6** — Session stays blocked until a substantive answer or an explicit cancel (`cancel` / `nevermind` / …). Pending ask is durable on the session (`discord_sessions.pending_ask`, schema **v8**).
- **AUTONOMY-7** — Impossible / joke “free energy / dark matter / zero-point” style asks: system prompt steers a witty public-safe decline or tiny toy demo — not a long formal MCQ / ask-human first.

### Ops

- Package version **0.0.20** — restart the Discord bridge after update (DB migrates to schema v8 on first open).

## 0.0.19

### Dogfood UX — identity, clean replies, thinking embed, public Q&A

- **IDENTITY-4** — Discord injects acting user id + display name (owner map wins for the owner; never invents names like "Kyn"); memory stays scoped to the acting Discord user.
- **DISCORD-3.a** — Thinking/progress embed footer shows **model**, session id, and operator plumbing (`state` / `verified` / `verifySkipped` / `attempts`). Final chat reply is **human text only** — no plumbing lines.
- **ROLES-CHAT-8** — Non-ADMIN community sessions may use **any public GitHub** (+ site/roadmap via web-fetch); **private repos** and **secret paths** (`.env`, keys, keystores) are refused. Deny lists still win. ADMIN keeps the GITHUB-6 allowlist.

### Ops

- Package version **0.0.19** — restart the Discord bridge after update; re-register slash if the gateway does not on ready.

## 0.0.18

### Ask the human, ping the owner — [#163](https://github.com/CorvidLabs/Corvidinho/pull/163) (#44)

- **ask-human** tool (AUTONOMY-1): when a task cannot proceed without a human choice, the run ends `blocked` with a clarifying question shown to the requester — never "done", never invented criteria.
- **Owner ping when stuck** (AUTONOMY-2 / AUTONOMOUS-7): only the configured owner can be mentioned; `@everyone`/roles/other users are defanged; text SAFE-6 scrubbed.
- Scheduled runs ping the owner **once per question** (schema **v7** `schedules.ask_ping_key`); `/work` never ships a PR from a run waiting on input.

### Autonomous gate + `delegate` — [#167](https://github.com/CorvidLabs/Corvidinho/pull/167) (#117)

- Autonomous mode is **off** until enabled in project config (AUTONOMOUS-1).
- `delegate` (AUTONOMOUS-5, SAFE-9: offered only when the gate is on; ADMIN-only under ROLES-CHAT) runs a subtask as a child `task run`: tier clamped to the lead's, depth ≤ 2, ≤ 2 concurrent / 4 per process, child env stripped of Discord/GitHub tokens and the audit key.

### Ops

- Package version **0.0.18** — presence (DISCORD-12) reads `v0.0.18` after restart.
- **Restart the Discord bridge and `corvidinho daemon`** (the DB migrates to schema v7 on first open).

## 0.0.17

### Searchable channel add/remove (ADMIN-2 UX / DISCORD-ANNOUNCE-2 amend)

- **`/admin channels add|remove`** — replace Discord’s limited native **CHANNEL picker** with **STRING + autocomplete**: type a few letters of the channel name (case-insensitive substring, emoji/unicode names ok) or paste a snowflake / `<#id>`; Discord returns ≤25 choices, ranked exact → prefix → substring → id.
- **`/announce channel`** — same searchable STRING + autocomplete (HI DISCORD-ANNOUNCE-2 amended 2026-09-26).
- Remove autocomplete scopes to the **live allowlist** when present; add/announce search all guild text channels from the gateway cache (Guilds intent).
- Handler still re-checks ADMIN (ADMIN-4 / DISCORD-7); persist path unchanged (`allowlist.toml` / announce SQLite).
- Discord API limits: autocomplete **max 25 choices**, **~3s** respond deadline, choice name/value **≤100** chars.

### Ops

- Package version **0.0.17** — presence (DISCORD-12) reads `v0.0.17` after restart.
- **Restart the Discord bridge** and re-register slash commands so STRING + autocomplete replaces the old CHANNEL options.

_Also in the v0.0.17 build (backfilled — merged just before this cut):_

### `/work` ships a draft PR — [#166](https://github.com/CorvidLabs/Corvidinho/pull/166) (#88)

- After a `/work` run in its git worktree, the bridge commits, pushes the work branch and opens a **draft PR** whose body comes from the real diff (files, diffstat, commits, verify result) — AUTONOMOUS-3 / GITHUB-2.
- Only when verify passed (or passes on one re-run, AGENT-4), `git-commit` / `git-push` / `github-pr-create` are allowlisted (GITHUB-5), the repo passes GITHUB-6, and the requester is the **owner** (ROLES-CHAT-3). Otherwise one plain line says why and the changes stay on the work branch. Never pushes the base branch or a switched/detached HEAD.

### Project instructions come from the committed tree — [#169](https://github.com/CorvidLabs/Corvidinho/pull/169) (#84)

- In git projects `AGENTS.md` / `CLAUDE.md` are read from the **HEAD commit**, so the agent's own file edits cannot plant instructions for later runs; non-git projects keep the working-tree read.
- To let `/work` open PRs, allowlist `git-commit`, `git-push` and `github-pr-create` in `CORVIDINHO_ALLOWLIST` (owner-only either way).

## 0.0.16

### New tools and a daemon

- **`corvidinho daemon`** ([#157](https://github.com/CorvidLabs/Corvidinho/pull/157), #108) — ticks schedules headlessly without Discord (CLI-8 / AUTONOMOUS-4): single-instance lock, claim-once runs safe alongside the bridge ticker, never ADMIN, clean SIGTERM; systemd unit example in `docs/`.
- **`web-fetch`** ([#148](https://github.com/CorvidLabs/Corvidinho/pull/148), #111) — GET-only, SSRF-guarded (SAFE-7): every resolved address checked, connection pinned to the checked IP with TLS verification on, redirects re-checked, size/time caps, text fenced as untrusted data. Dangerous (SAFE-1): needs consent or an allowlist entry.
- **Fledge plugins as tools** ([#154](https://github.com/CorvidLabs/Corvidinho/pull/154), #112) — the project's registered Fledge plugins become `fledge-<command>` tools (dangerous by default, argv only, stripped env); `plugins list` shows each tool's schema/context cost (FLEDGE-4/5, PLUGIN-3/6).
- **`github-pr-diff` / `github-pr-files`** ([#153](https://github.com/CorvidLabs/Corvidinho/pull/153), #93) — read a PR's unified diff (200 KiB cap, optional `--file`) and changed files; scrubbed, marked untrusted (GITHUB-3).
- **`github-ci-status` by PR or ref** ([#158](https://github.com/CorvidLabs/Corvidinho/pull/158), #94) — branch/tag/SHA plus an overall `green|red|pending|none` verdict incl. legacy statuses (GITHUB-4). `--json` shape is now an object (`data.checks` holds the rows).
- **Project instructions in the prompt** ([#150](https://github.com/CorvidLabs/Corvidinho/pull/150), #84) — `task run` reads the project's own `AGENTS.md` / `CLAUDE.md` (root-clamped, no symlink escape, 16 KiB cap, scrubbed) into the system prompt (AGENT-1).

### Security

- SAFE-6 scrubber: the PEM and JWT patterns are now linear-time and PR diffs are bounded before scrubbing, so a crafted diff can no longer stall a run (#153).

### Ops

- Package version **0.0.16** — presence (DISCORD-12) reads `v0.0.16` after restart.
- **Restart the Discord bridge and `github watch`** to pick up the new tools; run `corvidinho daemon` under systemd if you want schedules without the bridge. `web-fetch` and `fledge-*` tools need a SAFE-1 allowlist entry for non-interactive runs.

## 0.0.15

### Owner-only `/admin` runtime allowlist (ADMIN-1..4, #43)

- **ADMIN-1** — `/admin users add user:@x` approves a Discord user onto live `[discord].users` (file + in-memory; empty still deny-all).
- **ADMIN-2** — `/admin channels add|remove channel:#x` with **native CHANNEL picker** (same pattern as `/announce channel`) mutates `[discord].channels` without hand-editing toml.
- **ADMIN-3** — `/admin config show` is the audit-friendly read of live/file/env counts, owner, rate limits, mutes; updates go through ADMIN-1/2 only (safe knobs).
- **ADMIN-4** — Dispatcher `minPermission: ADMIN` plus handler re-check; empty owner ⇒ nobody is ADMIN / deny-all.
- Writes are atomic to the allowlist file the bridge already loaded (`CORVIDINHO_ALLOWLIST_FILE` or `~/.config/corvidinho/allowlist.toml`); env entries stay read-only; deny lists still win; last-channel and env-only removals refused; SAFE-5 audit rows on mutations.
- Slash set is **nine** commands including `/admin`. Re-register after deploy.

### Ops

- Package version **0.0.15** — presence (DISCORD-12) reads `v0.0.15` after restart.
- **Restart the Discord bridge** and run `discord register-commands` (or restart) so `/admin` appears in Discord.

## 0.0.14

### ROLES-CHAT tool gates (community read/chat vs ADMIN)

- **ROLES-CHAT-2..6** — Non-ADMIN Discord/WATCH/schedule sessions (when `CORVIDINHO_ACTING_IS_ADMIN` is set) only get **read/chat** tools in the catalog; mutating tools never appear.
- At tool-run time, non-ADMIN callers are refused for every mutating plugin — including `files-write` / `files-edit` (`mutating: true`, `dangerous: false`) — with a short in-session **not allowed for your role** (ROLES-CHAT-3/5).
- ADMIN (owner + `CORVIDINHO_ACTING_IS_ADMIN=1`, re-checked each call) may use mutating tools still behind **SAFE-1..9** / ALLOW / MEMORY-ACL (ROLES-CHAT-4/6).
- Prove-before-done: `tests/roles.chat.gates.test.ts` (ROLES-CHAT-7).
- HI: [`hi/roles.md`](hi/roles.md) (captured in #159).

### Ops

- Package version **0.0.14** — presence (DISCORD-12) reads `v0.0.14` after restart.
- **Restart the Discord bridge** so acting sessions pick up the role gates.

## 0.0.13

### Always verify on Discord / WATCH (#85 captured slice — AGENT-4 / FLEDGE-2)

- Discord and WATCH spawn clients **no longer pass `--no-verify`** (REQ-discord-085 / REQ-watch-085). Prove-before-done is the default for chat and ingress.
- Plain chat with no file edits still stays fast: the agent loop skips the verify lane when `filesChanged` is empty (honest `verifySkipped`).
- CLI `--no-verify` remains for **local/operator opt-out only** (REQ-cli-085). Draft AGENT-14/15 (remove the flag entirely; real git porcelain / deleted-test detection) wait for HI capture; SAFE-22 still draft after #82.
- Fixture tests assert spawn argv has no `--no-verify`.

### Ops

- Package version **0.0.13** — presence (DISCORD-12) reads `v0.0.13` after restart.
- **Restart the Discord bridge and `github watch`** so spawns pick up prove-before-done (no slash churn).

## 0.0.12

### Typed git tools (#82) — [#145](https://github.com/CorvidLabs/Corvidinho/pull/145)

- New builtins `git-status`, `git-diff`, `git-log` (safe) and `git-branch-create`, `git-commit`, `git-push` (dangerous, SAFE-1: denied non-interactive unless allowlisted) — PLUGIN-1/2, GITHUB-2.
- Project root only (SAFE-3); never stages `.env*` or keystores, and a branch switch refuses to overwrite ignored files (SAFE-2); git hooks never run from these tools; no force/amend/rebase exposed.
- `git-push` checks the remote's OWNER/REPO against the GitHub allow/deny lists (GITHUB-6). Draft SAFE-22 (refuse default-branch commits) awaits HI.

### Durable WATCH sessions (#37) — [#142](https://github.com/CorvidLabs/Corvidinho/pull/142)

- WATCH sessions keyed by `owner/repo#number` persist in the shared SQLite (**schema v6** `watch_sessions`; topic scrubbed, SAFE-6) with a soft idle TTL (default 45m) and survive restarts (SESSION-1..3).
- Shutdown is clean: after SIGTERM the poller never acks or spawns again; poll cycles never overlap; one failing event is logged and skipped instead of blocking the rest.

### Ops

- Package version **0.0.12** — presence (DISCORD-12) reads `v0.0.12` after restart.
- **Restart `github watch` and the Discord bridge** so the git tools and the schema v6 migration are picked up (the DB migrates on first open).

## 0.0.11

### Discord announce enrichment (DISCORD-ANNOUNCE-4 standing order)

- **DISCORD-ANNOUNCE-4** — `formatBridgeLiveAnnouncement` posts version header plus ≤5 CHANGELOG bullets for what shipped (REQ-discord-025).
- Prefer `CHANGELOG.md` section for the package version; fall back to package description or a single tip line when missing.
- Still posts **only** to the configured announce channel via `postAnnouncement` — never dogfood allowlist by default.
- Fixture tests for formatter + announce-channel-only post.

### Ops

- Package version **0.0.11** — presence (DISCORD-12) reads `v0.0.11` after restart.
- **Restart the Discord bridge** so ClientReady posts the richer bridge-live note.

## 0.0.10

### ⚠ Upgrade notes

- **Restart the bridge, `github watch` and the checkout together.** The wire protocol is now `2` (DISCORD-10); a new bridge refuses an old binary.

### WATCH reliability (WATCH-RELIABILITY-1..3)

- **WATCH-RELIABILITY-1** — After a successful auto-ack on mention/comment start/continue, post a short agent summary comment on the same GitHub thread when the run finishes (success or failure), once per event id (Made with Corvidinho footer).
- **WATCH-RELIABILITY-2** — Persist spawn outcome logging (start, exit code / error class, duration) as a structured `[watch] spawn …` log line and durable JSONL (`CORVIDINHO_WATCH_SPAWN_LOG` or `~/.local/share/corvidinho/watch-spawn.jsonl`) — readable without Discord.
- **WATCH-RELIABILITY-3** — On GitHub **403 rate-limit**, back off using `Retry-After` / `x-ratelimit-reset` (documented default **60s**); skip tight re-poll loops; clear `[watch] github rate-limit backoff` log line.
- HI captured in [`hi/watch.md`](hi/watch.md) (not draft).

### Ops

- Package version **0.0.10** — presence (DISCORD-12) reads `v0.0.10` after restart.
- **Restart `github watch`** to pick up summary comments, spawn JSONL, and rate-limit backoff.

_Backfilled: these shipped in the tagged build but were missing from the first notes for this version._

### Live NDJSON event stream for bridges (#73) — [#139](https://github.com/CorvidLabs/Corvidinho/pull/139)

- `task run --output text|json|ndjson`; `--json` stays an alias and its output is unchanged.
- `--output ndjson` writes one versioned JSON object per line as the run progresses: `StateChanged`, `Text`, `ToolCall` (a truncated, secret-scrubbed argument summary — never raw args), `ToolResult`, `VerifyResult`, running provider-reported `usage`, and a final `result` frame (summary capped at 4000 chars).
- The Discord thinking embed and WATCH read the stream live: current state, current tool, and the real running token total when the provider reports usage (AGENT-8 / CLI-7 / DISCORD-3).
- Frames from another protocol are never turned into reply text; the reply becomes a "protocol mismatch — restart the bridge" notice. Unoffered tool names show as "(unknown tool)".

### Security fix — `--task` text can no longer become CLI flags — [#143](https://github.com/CorvidLabs/Corvidinho/pull/143)

- The bridges pass untrusted Discord/GitHub text after `--task`. A message such as `--tier=code` or `--no-verify` used to lose its task text and be parsed as a flag, letting message text pick the capability tier. `--task` now always takes the next argv item; `--task=TEXT` keeps multi-line text (AGENT-5 / SAFE-1).

## 0.0.9

### ⚠ Upgrade notes

- **Set the owner before deploying.** ADMIN is now owner-only (IDENTITY-2). Set `CORVIDINHO_OWNER_DISCORD_ID` (or `[owner] discord_id` in the allowlist file) on the box. With no owner, nobody is ADMIN: `/mute`, `/unmute`, `/announce`, `/schedule` mutations and memory forget/override refuse everyone (IDENTITY-3 default-deny). `CORVIDINHO_DISCORD_ADMIN_USERS` / `_ROLES` are ignored; the bridge and `doctor` warn when they are set.

### Security — memory ACL hardening (#59 follow-up) — [#128](https://github.com/CorvidLabs/Corvidinho/pull/128)

- Memory plugins no longer accept `--user`, `--admin`, or `--db` from argv. In the LLM tool loop argv is model-controlled, so the model could previously read or overwrite any user's memories and self-assert ADMIN (MEMORY-ACL-1..4). The acting user and ADMIN now come only from bridge-set env (`CORVIDINHO_ACTING_DISCORD_USER_ID` / `CORVIDINHO_ACTING_IS_ADMIN`).
- ADMIN is re-checked in the plugin handler: the bridge's per-dispatch `CORVIDINHO_ACTING_IS_ADMIN=1` is required (scheduled runs never get ADMIN) and the live config must agree — empty `CORVIDINHO_DISCORD_ADMIN_USERS` + `_ROLES` ⇒ nobody; deny-listed/muted users are never ADMIN; admin user id, or admin roles configured (ADMIN-4).
- `memory-forget` / `memory-override` are real two-phase (SAFE-4): run once for a confirm token (no content), then `--confirm TOKEN` from a new turn within 10 minutes. The token is HMAC-bound to op + actor + memory id + row state (+ override content) and is single-use. No schema change.
- `memory-recall --include-deleted` is ADMIN-only.
- Phase 2 also needs the token to appear in the human's own message (the bridge passes only human-typed tokens), so the model cannot confirm from its own memory.
- Discord / schedule / WATCH spawns run non-interactive (SAFE-1), and the tool loop only runs tools it offered this run — a dangerous plugin can no longer be called by name.
- Re-storing a memory key keeps the prior content as a soft-deleted row instead of overwriting it (no non-admin forget path).
- Discord spawns always overwrite the acting env; WATCH spawns clear it.

### SAFE-6 secret scrub before persist (#66) — [#130](https://github.com/CorvidLabs/Corvidinho/pull/130)

- One redaction module (`src/store/scrub.ts`) on every SQLite write path: session topics, work tasks, schedules + runs, memory key/content. GitHub, OpenAI-compatible, Anthropic, Discord bot, Slack, AWS, Google, JWT, Bearer and PEM private-key shapes → `[redacted:<kind>]`.
- Re-scrub when rules tighten: opening the DB re-scrubs stored rows once whenever `SCRUB_RULES_VERSION` increases (first start after this release scrubs rows already written by #61/#64).
- Draft SAFE-10 (outbound replies, Discord-admin re-scrub) and Algorand mnemonics wait for HI capture.

### Spawned agents ignore the project `.env` — [#133](https://github.com/CorvidLabs/Corvidinho/pull/133)

- Spawns run with cwd = the talk's project worktree; Bun would auto-load that project's `.env*` into the agent. `.ts` spawns now run `bun --no-env-file`, so a worked-on repo cannot inject allowlists, admin lists or keys (ALLOW-4 / SAFE-1).
- `bun test` no longer creates real `talk/*` worktrees next to the repo.

### Restart recovery for `/work` (#87, SESSION-WORKTREE-3) — [#135](https://github.com/CorvidLabs/Corvidinho/pull/135)

- On bridge start, work left queued/running by a dead process is marked failed with an honest summary and its talk ended (worktree parked). Durable queue/locks/resume stay draft AUTONOMOUS-14.

### HI

- CLI-1, CLI-2, CLI-6, CLI-9 retired — no human CLI; humans use Discord/GitHub (#129 → [#134](https://github.com/CorvidLabs/Corvidinho/pull/134)).

### Ops

- Package version **0.0.9** — presence (DISCORD-12) reads `v0.0.9` after restart.
- **Restart the Discord bridge and `github watch`** so spawns pick up the hardened memory plugins, non-interactive SAFE-1, `--no-env-file`, and the one-time secret re-scrub. No slash re-register needed (command set unchanged). No schema migration beyond what main already had.
- Operators running `corvidinho plugins run memory-*` by hand now set `CORVIDINHO_ACTING_DISCORD_USER_ID` (+ admin env for forget/override) instead of `--user`/`--admin`; forget/override confirm tokens must be supplied by a human.
- Bot config belongs in the VM env / `~/.config/corvidinho/` — a `.env` inside a worked-on project is ignored by spawned agents.

### Shell plugin + SAFE-3 cwd clamp (#83)

- Typed builtin `shell-exec` (PLUGIN-1): `sh -c` with stdout/stderr merged; **dangerous** + `minTier: code` (PLUGIN-2); SAFE-1 allowlist in non-interactive.
- **SAFE-3:** spawn cwd pinned to plugin/project root; lexical refuse of `cd`/`pushd` that would escape (absolute outside, `..`, `~`, `$VAR`, bare `cd`) before spawn — Merlin steal.
- Exports `CORVIDINHO_PROJECT_ROOT` into the child env for nested tools.
- Fixture tests: happy path, SAFE-1 deny, SAFE-3 escape refuse, relative-within-root allow.
- `docs/hi-drafts/WATCH-RELIABILITY.md` — draft only for Leif (post-ack summary, spawn outcome log, 403 backoff); **not** captured to `hi/`.
- After restart, typed `shell-exec` + SAFE-3 cwd clamp are available to the LLM tool loop.

_Backfilled: these shipped in the tagged build but were missing from the first notes for this version._

### IDENTITY: durable owner record (#42) — [#138](https://github.com/CorvidLabs/Corvidinho/pull/138), owner-only ADMIN — [#141](https://github.com/CorvidLabs/Corvidinho/pull/141)

- Owner = Discord snowflake + optional GitHub login + display name, from `CORVIDINHO_OWNER_DISCORD_ID` / `_GITHUB_LOGIN` / `_DISPLAY` or the allowlist file `[owner]` section (env wins per field); survives restarts; the display name never matches anything (IDENTITY-1, ALLOW-4).
- The owner is the only ADMIN, re-checked at handler time in the bridge, slash dispatch and the memory plugins; muted or deny-listed owner is not ADMIN (IDENTITY-2/3, ADMIN-4).
- `/status` and `doctor` show "owner configured yes/no" plus the display name only — never ids, logins or tokens.

### SAFE-5 tamper-evident audit trail (#95) — [#136](https://github.com/CorvidLabs/Corvidinho/pull/136)

- Every dangerous plugin run appends HMAC-chained `started` → `ok`/`error` (or `denied`) rows to `audit_log` in the shared DB (schema v5, append-only triggers); raw args are never stored, only a digest; a dangerous run is refused if its `started` row cannot be written.
- `verifyAudit` finds the first tampered row; key from `CORVIDINHO_AUDIT_HMAC_KEY`. Draft SAFE-17 (wider coverage, Discord verify) awaits HI.

## 0.0.8

### Discord `/announce` (DISCORD-ANNOUNCE-1..6)

- Slash `/announce channel|show` — ADMIN sets/clears a dedicated ops/dev announcements channel via Discord’s native **CHANNEL picker** (never type a snowflake); `/announce show` and `/status` surface the current channel (empty = not configured / default-deny).
- Persist announce channel id in shared SQLite `schema_meta` across restarts.
- After every successful bridge restart, post a short `bridge live vX.Y.Z` note **only** to the configured announcements channel — not to the dogfood/chat allowlist.
- Mutations re-check ADMIN at handler time; empty admin = deny-all.
- Package version **0.0.8** — Discord presence (DISCORD-12) reads `v0.0.8` after bridge restart; **ops must restart the live bridge and re-register slash** (eight-command set). This release does not restart Corvidinho-run.

## 0.0.7

### Memory in Discord chat (AGENT-7 / MEMORY-2/4)

- **Auto-recall inject** on Discord spawn: before `agent.runChat`, recall up to 20 memories for `msg.authorId` and prepend a clear `[Corvidinho memory for this Discord user …]` block (empty scope still gets a one-liner nudging `memory-store`).
- **System prompt** (`src/agent/execute.ts`): trust injected block; call `memory-store` for durable identity/person/project facts; call `memory-recall` before claiming ignorance; never invent memories (draft #67 behavior without new HI ids).
- **Richer memory tool descriptions** + argv examples so the model actually calls `memory-store` / `memory-recall`.
- Bridge logs `[discord] memory inject: N recalled for user …` to stdout (ops: `/tmp/corvidinho-discord-bridge.log`).
- Fixture tests for inject helper + prompt/tool enrichment.
- No `/memory` slash (HI does not define one).

### Ops

- Package version **0.0.7** — Discord presence (DISCORD-12) reads `v0.0.7` after bridge restart (ops must restart live bridge + post channel update; this release does not restart it).

## 0.0.6

### Files / search plugins (PLUGIN-1/2, SAFE-2 / #81)

- Typed builtins: `files-read`, `files-write`, `files-edit`, `files-glob`, `files-list`, `files-delete`, `search-grep` (Merlin steal).
- Writes/edits/deletes require capability tier **code** (`minTier: 2`); `files-delete` is dangerous (SAFE-1 allowlist).
- Paths clamp to the plugin cwd (task worktree / project root); `..` and symlink escapes refuse.
- SAFE-2 hard-refuse overwrite/delete of protected infra: `.env*`, `.git`, `fledge.toml`, `specs/**` / `*.spec.md`, keystore basenames — no in-band override.
- Wired into plugin builtins so the LLM tool loop can call them at code tier.
- Fixture tests: happy path + SAFE-2 deny + path escape.

### Ops

- Package version **0.0.6** — Discord presence (DISCORD-12) reads `v0.0.6` after bridge restart (ops must restart live bridge; this release does not restart it).

## 0.0.5

### Session worktrees

- **SESSION-WORKTREE-1..5 / #58**: per-talk / per-schedule-run git worktree isolation so Discord/CLI talks do not bleed cwd or branch state across concurrent conversations.
- Worktree manager (`src/worktree/`): create / remove / park / prune; base dir `{projectSibling}/.corvid-worktrees` or `WORKTREE_BASE_DIR`; branch pattern `talk/{sessionPrefix}`; non-git projects get a scoped directory under the same base.
- Discord `@mention`, `/session start`, and `/work` bind an isolated workspace; optional `project` option on `/session start` and `/work` for explicit selection (no new slash commands). Once set, project never silently switches mid-conversation.
- Soft TTL / new-topic (SESSION-1..3) unchanged; isolation is filesystem/git context, not MEMORY continuity (SESSION-4).
- End / abandon / TTL purge parks or removes the worktree so another talk never silently reuses it as cwd.
- `/schedule` ticks resolve `schedule.project` into that project's worktree/scope, then park after the run (align DISCORD-SCHEDULE single-project path).
- Shared SQLite schema **v4**: `discord_sessions` columns `project`, `worktree_path`, `worktree_branch`, `worktree_state`.

### Ops

- Package version **0.0.5** — Discord presence (DISCORD-12) reads `v0.0.5` after bridge restart (ops must restart live bridge; this release does not restart it).


## 0.0.4

### Memory

- Local SQLite MEMORY in shared `~/.local/share/corvidinho/corvidinho.db` (schema **v3**): conversations, entities, people, personality notes (MEMORY-1..4 / #41).
- Per-user ACL by Discord `owner_user_id` (MEMORY-ACL-1..5 / #59): store/recall scoped to acting user; **ADMIN-only** forget/override including **self-forget**; empty admin/owner = deny-all; refuse without leaking other users' content.
- Soft-delete with `deleted_at` / `deleted_by_user_id` audit fields.
- Plugins: `memory-store`, `memory-recall`, `memory-forget`, `memory-override` (forget/override dangerous + `--confirm` / SAFE-4). No `/memory` slash (HI does not define one).
- Bridge passes `CORVIDINHO_ACTING_DISCORD_USER_ID` / `CORVIDINHO_ACTING_IS_ADMIN` into agent spawns (DISCORD-7 re-check at handler time).

### Ops

- Package version **0.0.4** — Discord presence (DISCORD-12) reads `v0.0.4` after bridge restart.


## 0.0.3

### Discord

- `/schedule` list|create|pause|resume|delete — recurring single-project agent runs (DISCORD-SCHEDULE-1..5 / #57); 5m min cadence; ADMIN mutations; cooperative ~60s ticker that does not starve HEAR/WATCH; SQLite schedules in shared store.

### Ops

- Updater: pidfile `/tmp/corvidinho-discord-bridge.pid` stop/start + ready-wait (`logged in` / protocol OK) with SHA rollback; `docs/UPDATE.md`.
- Release Action: idempotent when the GitHub Release already exists.
- Builds on #45 (tag→Release + `scripts/corvidinho-update.sh` + `docs/BOX-UPDATE.md`).

## 0.0.2

### Dogfood polish

- Shared version helper + richer Discord `/status`; LLM tool loop behind `CORVIDINHO_LLM_*`.
