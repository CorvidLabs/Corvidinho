# Changelog

## 0.0.30

### Discord sessions and images

- **Continued Discord sessions keep their thread** — [#239](https://github.com/CorvidLabs/Corvidinho/pull/239) (AGENT-6, DISCORD-2, DISCORD-2.a, SESSION-2/3, SESSION-MULTI-1, SAFE-4, SAFE-6): a continued session kept its id, but the model saw only the newest message, so the thread was lost on every turn, and a button pick sent only the question and the picked label without the original request. Every Discord agent run (@mention or reply chat, button-pick resume, `/session start`, `/work`) now records the human's own words when the run starts and the posted answer (or the failure line) when it ends, and a continued run gets the earlier turns, oldest first, in a labelled `[Corvidinho earlier conversation in this Discord session …]` block ahead of the new message. The block is capped at 6000 characters and each turn at 1500; when the thread is longer, the opening request and the newest turns are kept and the middle becomes one `(N earlier turns omitted)` marker (nothing is summarised). A button ask is recorded as its question plus its choices; a SAFE-8 spend-cap stop records no answer turn. Turns live in the new `discord_session_turns` table (created when the bridge opens the DB, no schema version bump), are secret-scrubbed on write and covered by the re-scrub, are kept to at most 200 per session, survive a bridge restart within the soft TTL, and are deleted when the session ends or expires. A session idle past the TTL still starts fresh, another user's session never sees your turns, SAFE-4 confirm tokens still come only from the current message, and the replayed block does not steer Planning module selection. CLI `task run` and WATCH continues are unchanged.
- **The agent can look at images it opens** — [#240](https://github.com/CorvidLabs/Corvidinho/pull/240) (DISCORD-9): the bridge already saved Discord attachments under `<session cwd>/.corvidinho/attachments/` and cited their paths, but `files-read` decoded every file as UTF-8 text, so the model got replacement characters instead of the picture (a 2 MB screenshot became a tool payload of about 6M characters). `files-read` now recognises PNG, JPEG, GIF and WebP by their leading bytes (not the file name) and, after the path clamp, the ROLES-CHAT-8 secret gate and the existing-file check, returns only metadata (`image <path> (<mime>, N bytes) opened for viewing`); the tool loop then sends the image to the model as an `image_url` data-URL part, in one user message after that round's tool messages. The base64 never appears in tool text, events, ndjson or `plugins run` output. Images over 20 MB (the Discord attachment limit) are refused. If a request carrying images gets HTTP 400, 404, 413, 415 or 422, the loop drops the image parts, puts `[image <path> could not be shown to this model]` in the tool result, emits an `[operator]` note and retries that request once; later images in the same run go as that note. Text files read exactly as before. An opened image stays in the conversation and is re-sent on later rounds.

### Scheduler and daemon

- **Schedule ticks check the creator; the daemon ticks against the live allowlist** — [#236](https://github.com/CorvidLabs/Corvidinho/pull/236) (DISCORD-SCHEDULE-3, ALLOW-3, ALLOW-4, IDENTITY-2, CLI-8): a tick checked only the schedule's channel and then ran and posted as the creator, so a schedule whose creator was deny-listed, or missing from a non-empty user allowlist, still ran and posted while a live message from that user was refused. Each tick now runs the creator through the same actor gate as live Discord ingress (the configured owner passes, deny wins) and then the channel check, before any worktree or agent spawn and again right before the post. A run refused at start is recorded failed as `creator not allowlisted: …` (no user id in it) or `channel not allowlisted: <id>` and counts toward the 5-failure auto-pause; a creator refused mid-run gets no post. Schedules store no member roles, so with a non-empty role list a creator admitted only through a role is refused unless listed by user id or the owner; with empty user and role lists, ticks stay channel-gated as before. Mutes are not part of the tick gate. `corvidinho daemon` loaded the allowlist once at start, so after `/admin channels remove` or a users/deny edit it kept running the removed channel's schedules until restart, and it passed no owner to the scheduler; it now re-reads the allowlist (file, env overlays, `DISCORD_CHANNEL_IDS`) before every tick and passes the configured owner, loaded once at start. If the allowlist file cannot be read or parsed, the daemon skips that tick and logs `tick.allowlist_failed` with the loader's error (never list values): nothing runs and due schedules stay due.
- **Daemon schedule runs that need a human reach Discord** — [#238](https://github.com/CorvidLabs/Corvidinho/pull/238) (AUTONOMY-2, AUTONOMOUS-7, AUTONOMY-4, SAFE-8, DISCORD-SCHEDULE-3): when a schedule run claimed by `corvidinho daemon` stopped to ask (stuck, clarify or the daily spend cap), nothing was posted: the daemon has no Discord connection, the run row stored only `failed (exit 1)`, and the question was lost even with a bridge on the same data dir. The run row now records the ask (its reason and the question, secret-scrubbed and capped; schema **v11**), and the bridge's scheduler tick posts each schedule's newest pending ask to the schedule's channel once, with the same pings as a run the bridge ran itself: the owner for stuck and spend-cap, the schedule's creator for clarify, at most one ping per question and one per cap episode, no reply hint on a spend-cap ask, and a pending 80% spend warning attached. An ask is dropped once a later run of that schedule has finished or the schedule is deleted, and a schedule with no channel never gets its ask posted. Delivery is gated live like #236: while the creator or the channel is refused, the ask stays pending, and it is posted on the next tick after `/admin` allows them again (a bridge run refused at post time also leaves its ask pending). A post that returns false or throws hands the ask back for the next tick (a throw is logged as `[scheduler] ask failed: …`); the claim is a compare-and-set, so two bridges on one DB post it once. A tick never waits for these posts, and bridge stop waits up to 3 s for one in flight. The daemon itself still needs no Discord token, never posts, and logs `run.needs_human` (`reason` `stuck`, `clarify` or `spend-cap`); with only the daemon running, the question waits on the run row until a bridge starts.

### Agent verify gate and per-tier models

- **Verify runs whenever the git working tree changed, not only when a tool says so** — [#237](https://github.com/CorvidLabs/Corvidinho/pull/237) (AGENT-4, AGENT-4.a): the verify gate ran only when a tool reported changed files (`files-write`, `files-edit`, `files-delete`, `git-commit`), so an edit made through `shell-exec`, a commit made in a shell, a Fledge command or any other process in the checkout could end `done` with verify skipped. With the gate on, the loop now snapshots the git state after Planning (`HEAD`, `git status`, and a fingerprint of each already-dirty path) and, after each attempt, adds every path that differs (new commits, newly dirty or untracked files, deletions, already-dirty files whose content changed, dirty files that became clean) to `filesChanged`, up to 1000 per run, with one `Verify gate: the git working tree has N changed path(s) no tool reported (…)` note naming up to 5 of them. Verify then runs as usual, and a shell-only retry after a failed verify is verified again with the failure feedback. If git cannot read the diff after a good start snapshot, verify runs anyway (fail closed). A non-git cwd or an unreadable start snapshot keeps the old tool-reported behaviour; pre-run dirt the run leaves untouched, gitignored paths, and changes inside a nested repo or submodule are not counted; in a shared (non-worktree) checkout, another process's edits during the run count as this run's. `--no-verify` and `verify_before_complete = false` are unchanged and take no snapshot.
- **A model per capability tier** — [#234](https://github.com/CorvidLabs/Corvidinho/pull/234) (AGENT-5, SAFE-8): the tier already chose the tool catalog, but every tier called the one `CORVIDINHO_LLM_MODEL`, including read-tier delegate workers and council voices. New optional `CORVIDINHO_LLM_MODEL_READ`, `CORVIDINHO_LLM_MODEL_TOOL` and `CORVIDINHO_LLM_MODEL_CODE` set the model for runs at that tier (a blank value counts as unset), each falling back to `CORVIDINHO_LLM_MODEL` and then `gpt-4o-mini`; `--tier`, and a delegate or council child's own tier, now picks the model as well as the tools. Endpoint and API key stay shared across tiers. With no per-tier key set, nothing changes. SAFE-8 prices the model actually sent; an unpriced model's ask now names the key that set it (for example `CORVIDINHO_LLM_MODEL_READ`), and with a cap set, the doctor `spend` line and `/status` flag an unpriced per-tier model with its tier (`read-tier runs stop and ask`). The doctor `llm` line appends `; per tier: read …, tool …, code …` (model names only, never the key) when any per-tier key is set. `/status` and the Discord thinking footer still name the env tier's model, which is what bridge runs use.

### SpecSync

- **Local spec-check runs at CI strictness; `specsync score` report** — [#235](https://github.com/CorvidLabs/Corvidinho/pull/235) (SPECSYNC-2, SPECSYNC-3, SPECSYNC-6, SPECSYNC-7): the Fledge `spec-check` task ran plain `specsync check`, so the verify lane passed a tree that the CI Spec Sync Action (`require-coverage: "100"`) rejects, such as a new source file with no spec. `fledge.toml` now runs `specsync check --require-coverage 100` (no `--strict`, matching `strict: false` in `spec-sync.yml`), and a parity test fails if the two drift apart; a spec-check failure still goes through retry and ends with `verified=false`. `specsync-check` now uses the Fledge task only when fledge is on PATH and the project's own `fledge.toml` defines `spec-check` (a `fledge.toml` it cannot parse keeps the Fledge path); otherwise it runs the local `specsync check`, where before it failed with `Unknown task 'spec-check'` or `no fledge.toml found`. The new `specsync-score` tool (tier 0, not dangerous, refuses `--root`, forwards module names, `--explain` and `--format json`) and `corvidinho specsync score` run the local `specsync score` with no API key; before, a score report needed the dangerous `shell-exec`.

### Plugins and shell safety

- **node, python and cargo runner plugins** — [#241](https://github.com/CorvidLabs/Corvidinho/pull/241) (PLUGIN-4, PLUGIN-2, SAFE-1, SAFE-3): new `node-exec`, `python-exec` (runs `python3`, else `python`) and `cargo-exec` run that toolchain with the given argv exactly as given (no shell, no expansion), starting in the project root or task worktree. Each registers only when its binary resolves on an absolute PATH entry when the builtins load (a relative entry such as `.` is ignored, and Bun's own `node` shim does not count as node), so a missing toolchain is neither registered nor offered. `corvidinho plugins list` prints a `Language runners (PLUGIN-4): …` line naming what loaded and `<name> not loaded: <tool> not found on PATH` for each missing one, and still exits 0; `--json` just lists the loaded runners. Each is dangerous with `minTier` 2: denied in non-interactive runs unless named in `CORVIDINHO_ALLOWLIST`, and offered to the model only at code tier with dangerous tools included, to ADMIN. The child gets the verify lane's scrubbed env (no Discord config, GitHub tokens, audit key, acting identity or LLM keys, and no `CDPATH`/`OLDPWD`) plus `CORVIDINHO_PROJECT_ROOT`; output is secret-scrubbed and capped at 64 KiB per stream; the process tree is killed after 10 minutes (exit 124) or on the calling run's abort (exit 130); a binary that cannot start returns exit 127, and empty argv is a usage error (exit 1). The start dir is not a SAFE-3 clamp: code a runner runs can `chdir` elsewhere. `task run` does not offer dangerous tools to the model yet, so today the runners are reached through `corvidinho plugins run` and catalogs built with dangerous tools.
- **The shell `cd` clamp reads quoting the way the shell does** — [#226](https://github.com/CorvidLabs/Corvidinho/pull/226) (SAFE-3): the check that keeps `shell-exec` commands from `cd`-ing out of the project root could disagree with the shell about what was quoted and what was code, so a real `cd` ran outside the root while the check passed (an escaped backslash before a newline, a quote inside a `#` comment, a lone quote in a here-doc body, `)` in a comment inside `$( )`, a backtick in a here-doc delimiter, bash `$'…'` quoting, a shell's `-c` string). Backslash-newline continuations are now handled inside the tokenizer; `#` at a word start comments to the end of the line; a here-doc body is data up to the exact delimiter line (tabs stripped for `<<-`), while an unquoted body's `$( )` and backticks are still checked; the end of `$( )` comes from the same tokenizer. A command holding `$'` is also read the way bash reads ANSI-C quoting (so `cd $'\x2e\x2e'` refuses), a command holding `<<` is also read with every line as code, and the command refuses if any reading refuses. The `-c` string of a shell (`sh`, `bash`, `dash`, `zsh`, `ksh`, `mksh`, `ash`, `yash`, `posh`, by name or path, anywhere in the command, so `env`, `exec`, `nohup`, `timeout`, `xargs` and `find -exec` wrappers count) is checked like an `eval` argument. A `cd`/`pushd` left open by an unterminated quote or a trailing backslash refuses, and nesting deeper than 64 levels of `$( )` / `eval` / `-c` refuses as `(nested too deeply to check)` (before, about 20,000 nested `$(` threw `RangeError` out of `shell-exec`). Refusals are still exit 2 with the SAFE-3 message, before spawn. Still out of reach for this lexical check: other interpreters' `chdir` (`python3 -c`, `perl -e`, `node -e`), `sh script.sh`, `.` / `source`, and tools' own `-C dir` flags. Test-only: a `bun test` segfault on Bun 1.3.11 in the web-fetch TLS loopback test is worked around.

### Releases

- **Every package version gets a tag and a GitHub Release from CI** — [#231](https://github.com/CorvidLabs/Corvidinho/pull/231): the release workflow ran only on a hand-pushed `v*` tag, and agent sessions cannot push tags, so 0.0.12, 0.0.13, 0.0.16, 0.0.18, 0.0.21 and 0.0.23–0.0.29 had no tag and no Release. `.github/workflows/release.yml` now tags from CI with `GITHUB_TOKEN`: on a push to main it tags every release version that has no tag yet, oldest first, up to main's `package.json` version, each at the commit that bumped it, and creates its Release (the version's CHANGELOG section, the commits since the previous `vX.Y.Z` tag, and the updater line), so a release PR needs no hand-pushed tag and a cancelled or failed run is caught up by the next push. A hand-pushed `vX.Y.Z` tag still gets its Release (with a warning if its commit has a different `package.json` version or is not on main), and a manual `workflow_dispatch` run on main with `versions` tags and releases the listed versions. Existing tags and Releases are never moved, edited or deleted; the only edit is marking main's version Latest. GitHub starts no run when more than three tags are pushed at once, so use the manual run for bulk tags.

### Ops

- Package version **0.0.30** — restart the Discord bridge, `corvidinho daemon` and watch after update. **Schema migrates to v11** on first open: `schedule_runs` gains `ask_reason`, `ask_question` and `ask_posted_at` (added columns) plus a partial index on pending asks; runs recorded before v11 have no ask, so the upgrade never posts old history. The bridge also creates the `discord_session_turns` table (#239) on first open, without a version bump. Restarting the bridge and daemon together is not needed for safety this time (the migration only adds columns, and runs written by 0.0.29 already record their runner, so the 0.0.29 v10 caveat does not repeat; it still applies when updating straight from an older version), but daemon asks reach Discord only once both run 0.0.30: a 0.0.29 daemon records no ask, and keeps ticking on the allowlist it loaded at start without the creator gate, while a 0.0.29 bridge never posts the asks a 0.0.30 daemon records. The updated bridge's first tick posts each schedule's newest pending ask, unless a later run of that schedule has finished by then. Bridge stop can take up to 3 s longer while a pending-ask post is in flight.
- Check your schedules after updating: a schedule whose creator is deny-listed, or is not the owner and not on a non-empty Discord user allowlist (including a creator admitted only through a role), now fails at every tick with `creator not allowlisted: …` and auto-pauses after 5 failures in a row. Add the creator's user id or lift the deny entry, then `/schedule resume` it if it was paused. Schedules with empty user and role lists are unaffected.
- The daemon now re-reads the allowlist file before every 60 s tick, so `/admin` edits reach it without a restart. While the file is malformed or unreadable, every daemon tick is skipped and `tick.allowlist_failed` is logged each time; fix the file and the next tick picks it up. A change of the configured owner still needs a daemon restart.
- Discord, WATCH, schedule and `task run` runs with the verify gate on now run the verify lane when they changed the git working tree only through a shell or another process, so such runs can now end with verification failed where they used to end `done`. Each attempt adds 2–3 read-only git calls.
- In a Corvidinho checkout, the verify lane's `spec-check` now runs `specsync check --require-coverage 100`, so a source file without spec coverage fails the local lane, as it already failed the CI Spec Sync job. For other projects, `specsync-check` runs that project's Fledge `spec-check` task when fledge is on PATH and the project's `fledge.toml` defines one, else plain `specsync check` under the project's own config.
- Optional new env: `CORVIDINHO_LLM_MODEL_READ`, `CORVIDINHO_LLM_MODEL_TOOL`, `CORVIDINHO_LLM_MODEL_CODE`. Unset, every tier calls `CORVIDINHO_LLM_MODEL` as before. If you set them with `CORVIDINHO_DAILY_SPEND_CAP_USD` on, run `corvidinho doctor`: an unpriced per-tier model shows as `[warn]` on the `spend` line (it never fails doctor), and runs at that tier stop and ask before calling the provider.
- The runner plugins register when the builtins load, from the PATH of that process: `corvidinho plugins list` shows which loaded. A toolchain installed later needs a restart. Non-interactive runs deny them unless they are named in `CORVIDINHO_ALLOWLIST`.
- Token spend rises on long Discord talks and images: a continued run carries up to about 6000 extra characters of thread, and each opened image is sent as base64 and re-sent on later rounds (the SAFE-8 pre-call estimate counts request bytes), so a small `CORVIDINHO_DAILY_SPEND_CAP_USD` is reached sooner. A model without image input gets a text note after one retry.
- Correction to the 0.0.29 notes, which said "None of 0.0.26–0.0.28 is tagged": since #231, CI tags every package version at the commit that bumped it and creates its GitHub Release. v0.0.12–v0.0.29 are now tagged with Releases (v0.0.29 was Latest before this one), so any version from 0.0.2 on can be pinned with `CORVIDINHO_REF=vX.Y.Z`, and v0.0.30 gets its tag and Release from CI when this bump lands on main.

## 0.0.29

### Discord asks and sessions

- **Replying to a slash answer continues its session** — [#215](https://github.com/CorvidLabs/Corvidinho/pull/215) with [#216](https://github.com/CorvidLabs/Corvidinho/pull/216) (DISCORD-2, DISCORD-2.a, SESSION-MULTI-1..4): replying to a `/session start` or `/work` answer continues that session, with reply-ping on or off. #216 tracks the collapsed thinking message the answer is edited into; #215 also tracks the deferred slash reply used when collapse fails, and a failed tracking write no longer stops the slash reply. Before, a reply with ping on ran in the user's newest session in the channel, and a reply with ping off did nothing. Only the session's owner continues it; another member's reply never does.
- **Slash asks stay pending** — [#216](https://github.com/CorvidLabs/Corvidinho/pull/216) (AUTONOMY-1, AUTONOMY-5, AUTONOMY-6): a `/work` or `/session start` run that stops to ask (clarify or stuck) keeps the question as the session's pending ask. Replying to the answer message works like a chat ask: a thin reply (`ok`) restates the question without running the agent, `cancel` drops it, and a real answer resumes the session with the question as context. Another member's reply runs nothing, posts nothing and leaves the ask pending. A spend-cap stop is never left waiting on a reply.
- **Collapsed answers still ping** — [#220](https://github.com/CorvidLabs/Corvidinho/pull/220) (DISCORD-ASK-6/7, AUTONOMY-2, AUTONOMY-4, SAFE-8): Discord never notifies a mention added by editing a message, so an answer delivered by editing the thinking or Choose-stub message (chat, button pick, `/work`, `/session start`) pinged nobody. When such an answer mentions someone, the bridge now follows it with one short fresh post replying to it: `<@requester> ↑ question for you` for a clarify, `<@owner> ↑ needs you` for stuck, a spend-cap stop or the 80% spend warning. Allowed mentions are exactly those users, nobody is pinged twice in one turn, and no extra post goes out when the answer was already a fresh reply or mentions nobody. Replying to the ping post continues the session.
- **Talk worktrees no longer collide** — [#206](https://github.com/CorvidLabs/Corvidinho/pull/206) (SESSION-WORKTREE-1, SESSION-WORKTREE-3, DISCORD-SCHEDULE-1): talks whose ids share the first 16 characters no longer share one worktree dir and one `talk/` branch (the second talk used to force-remove the first talk's live worktree). Default talk branches are now `talk/{16-char id prefix}-{16 hex of sha256(full id)}`; talks stored before the upgrade keep their stored worktree and branch, and schedule runs keep `talk/schedule_{scheduleId}_{runId}`.

### Discord access, rate limits and privacy

- **Forwards and other-channel replies stay out of non-allowlisted channels** — [#218](https://github.com/CorvidLabs/Corvidinho/pull/218) (DISCORD-5, DISCORD-DENY-1..3, DISCORD-2.a): a message in a channel that is not allowlisted (e.g. a forward of a tracked bot message, or a reply referencing one from another channel) no longer continues the session, runs the agent or posts/edits anything there; it is dropped silently. The gateway keeps a message reference only for a same-channel reply, never a forward. Ask button presses get the same check: a press counts only in an allowlisted channel (or the session's thread under one) while the session's channel is still allowlisted; otherwise it gets only an ephemeral allowlist tip (admin) or a silent ack, and the ask stays pending. Same-channel replies and threads under an allowlisted parent still continue their session.
- **`/session list` shows only your own sessions** — [#219](https://github.com/CorvidLabs/Corvidinho/pull/219) (SESSION-MULTI-1, IDENTITY-2, IDENTITY-3, DISCORD-SCHEDULE-2): for anyone but the owner (ADMIN), `/session list` shows only the caller's own sessions, with each project by name and never an absolute host path, so other users' ids, mentions and topics no longer leak. The owner still sees every session with full paths; with no owner configured, everyone sees only their own; the legacy admin user/role env lists cannot widen it. `/schedule list` shows non-owners the project name only.
- **DISCORD-6 rate limits and mutes** — [#221](https://github.com/CorvidLabs/Corvidinho/pull/221) (DISCORD-6, IDENTITY-2, DISCORD-DENY-2): `DISCORD_RATE_LIMIT_BY_LEVEL` now applies on chat and slash (it was ignored, so everyone got the default max); the level comes from the actor's user id and roles — 3 for the owner, 2 for any other allowed caller. `/mute` refuses (ephemeral) to mute yourself or the owner; before, an owner who self-muted could not `/unmute` until a restart. A muted or rate-limited member gets at most one public notice per rate-limit window instead of one per message; slash refusals stay ephemeral every time.

### Security and secrets

- **Secret files hidden from the chat read tools** — [#214](https://github.com/CorvidLabs/Corvidinho/pull/214) (ROLES-CHAT-8, SAFE-2, SAFE-6): in non-ADMIN chat sessions, `search-grep`, `files-list`, `files-glob` and `git-diff` apply the same secret-path gate as `files-read` (`.env*`, `.ssh`, key files, keystores, credentials). An explicit secret path (any spelling, or a symlink to one) is refused with exit 2; a recursive grep never returns a secret line whatever `--include` is passed; listings and globs leave secret paths out; `git-diff` never lists or prints a tracked secret file. ADMIN and the local CLI keep their access.
- **SpecSync reads stay inside the project** — [#212](https://github.com/CorvidLabs/Corvidinho/pull/212) (SPECSYNC-1, SPECSYNC-5, SPECSYNC-6, PLUGIN-1): `specsync-read` and `specsync-brief` accept only plain module names (letters, digits, `_`, `-`) and never read a file whose real path is outside the project's `specs/` dir (traversal, absolute paths, symlinked specs, module dirs or companions), so neither a model tool call nor the Planning spec briefing can pull in an outside file. `specsync-coverage`, `specsync-change-list` and `specsync-ship-status` refuse a forwarded `--root`.
- **Tests never write the operator's data dir; the verify lane never sees operator secrets** — [#213](https://github.com/CorvidLabs/Corvidinho/pull/213) (SAFE-5, SAFE-6): the prove-before-done verify lane (Discord, WATCH, daemon, `task run`) now runs `fledge lanes run verify` without Discord config, GitHub tokens, the audit key, acting-identity vars or LLM API keys, so tests the agent wrote cannot read them. The `bun test` preload always uses its own temp data dir and unsets the audit key, WATCH spawn log, worktree base, LLM keys, spend cap and non-interactive flags (also for processes tests spawn), so a verify run no longer writes test audit rows — signed with the operator key — into the live DB.

### Scheduler, daemon and updater reliability

- **Schedule runs never stay "running"** — [#222](https://github.com/CorvidLabs/Corvidinho/pull/222) (CLI-8, AUTONOMOUS-4, DISCORD-SCHEDULE-2, DISCORD-SCHEDULE-4, SESSION-WORKTREE-3): bridge stop now records an in-flight schedule run failed (`interrupted: bridge shutdown`) and kills its agent tree, as the daemon already did. A failed outcome write (e.g. `SQLITE_BUSY`) is retried once, then logged as `[scheduler] run failed: could not record run …` and counted as failed instead of being swallowed. Each run records the process that owns it (schema **v10** `schedule_runs.runner`); on start, the bridge and daemon mark runs whose process is gone (e.g. `kill -9`) failed with `interrupted: process restarted`, leave runs a live bridge/daemon on the same data dir owns alone, and remove leftover `talk-schedule_*` worktrees of runs this data dir recorded as no longer running (a branch with its own commits is kept) — logged as `[discord] restart recovery: …` / `daemon.recovered`. Bridge and daemon stops wait up to 3 s for aborted runs to park their worktree.
- **Updater waits for the real Discord login** — [#228](https://github.com/CorvidLabs/Corvidinho/pull/228) (DISCORD-ANNOUNCE-4, DISCORD-12): in pidfile mode the box updater counts the restarted bridge ready only on `[discord] logged in as <tag>` (printed after a successful Discord login), no longer on the earlier `[discord] protocol version N OK`. A bridge that dies at login (bad token, 403) or does not log in within `CORVIDINHO_READY_TIMEOUT` (default 60 s) now rolls the update back (exit 1) instead of being reported healthy. systemd mode is unchanged (`systemctl is-active`).

### CLI and doctor

- **Doctor reports what the bridge and watch actually load** — [#225](https://github.com/CorvidLabs/Corvidinho/pull/225) (CLI-4, ALLOW-4, MEMORY-1): `corvidinho doctor` reads the Discord channel and GitHub repo allowlists through the same loader as the bridge and WATCH (allowlist file plus env, deny wins), so allowlists that live only in the file no longer show as `[missing]`; the line gives the count and source (`file`, `env`, `file + env`), never ids or repos, and a malformed allowlist file fails both checks. New `llm` line: `[warn]` when neither `CORVIDINHO_LLM_API_KEY` nor `OPENAI_API_KEY` is set (`task run` uses the demo stub); it never changes the exit code. New `data-dir` line: `[ok]` writable, `[info]` not there yet but its parent is writable, `[fail]` (exit 1) not a directory, not creatable or not writable.
- **Clean CLI errors** — [#227](https://github.com/CorvidLabs/Corvidinho/pull/227) (CLI-4, CLI-7, SAFE-6, WATCH-RELIABILITY-3): a failing command prints one line `corvidinho: <error>` plus a `hint:` (`corvidinho plugins list`, `CORVIDINHO_DATA_DIR` or `corvidinho doctor`) and exits non-zero, instead of a stack trace and Bun's crash footer; with `--json` the error is `{ "ok": false, "error": … }` on stdout. Existing exit codes are kept (unknown plugin 1, SAFE-1 denial 2). The line is secret-scrubbed, including the literal values of the secret env vars. `discord bridge` with a rejected token prints `discord login failed (401): check DISCORD_TOKEN (…)` and exits 1; `discord register-commands` and the bridge's slash registration at login print one line with the HTTP status. `github watch` stops and exits 1 on a GitHub 401 (`[watch] github auth failed (401): … watch stopped`) instead of dumping an Octokit error on every poll forever; the 403/429 rate-limit backoff is unchanged.

### Audit and agent loop

- **A keyed audit chain cannot be downgraded row by row** — [#209](https://github.com/CorvidLabs/Corvidinho/pull/209) (SAFE-5): with `CORVIDINHO_AUDIT_HMAC_KEY` set, an unkeyed row after a keyed row now reads as `chain BROKEN at #N` (a keyed row rewritten and relinked as plain SHA-256 used to pass as "mixed"), and a process without the key refuses to append after a keyed row, so it refuses dangerous plugin runs and `/admin` changes instead of breaking the chain. An unkeyed prefix followed by keyed rows (key set later) still verifies. Downgrading the whole keyed tail or truncating it is not caught; that needs an anchor outside the DB.
- **No more "database is locked" on audit writes** — [#211](https://github.com/CorvidLabs/Corvidinho/pull/211) (SAFE-5, SAFE-6): audit appends and the SAFE-6 re-scrub take the SQLite write lock up front, so while another process (bridge, daemon, watch, CLI) writes to the shared DB they wait under the busy timeout instead of failing at once. Before, a lost `started` row refused the dangerous run and a lost `ok`/`error` row left the audit trail without an outcome.
- **`task run` stops cleanly; a stalled LLM request times out** — [#207](https://github.com/CorvidLabs/Corvidinho/pull/207) (AGENT-3): on the first SIGINT/SIGTERM `corvidinho task run` cancels the run, prints the cancelled result, exits 130 and kills the whole `fledge lanes run verify` process tree (the lane used to keep running in the background). An abort during verify is a cancel, not a failed verify, retry or ask; a run started with SIGINT ignored (a background job) keeps ignoring it. Each LLM request is bounded at 10 minutes, so a stalled provider reports `LLM request timed out after 600000ms` instead of hanging forever.

### Docs

- **Operator docs match the shipped code** — [#229](https://github.com/CorvidLabs/Corvidinho/pull/229): DISCORD-GO-LIVE, `docs/discord.md`, BOX-UPDATE, UPDATE, WATCH, DAEMON, `.env.example` (now lists the GitHub allowlist and WATCH env vars and what the rate-limit levels mean), `allowlist.example.toml`, README, AGENTS.md and STATUS/ROADMAP re-checked against the code, including #213, #214, #218, #219, #220, #224 and #225. DISCORD-GO-LIVE now says Server Members Intent is needed only for the DISCORD-8 requester check (`discord-post-message --requesting-user-id`). Earlier CHANGELOG entries corrected (0.0.23 "already in the v0.0.22 tag" notes, the #177 `project` option, ROLES-CHAT-8 `web-fetch`, the WATCH spawn-log path). `tests/docs.operator-facts.test.ts` pins these facts to the code.

### Ops

- Package version **0.0.29** — restart the Discord bridge, `corvidinho daemon` and watch after update. **Schema migrates to v10** on first open (`schedule_runs.runner`, an added column). Restart the bridge and daemon together: on start, a `running` schedule run written before v10 has no runner and counts as abandoned, so an old-version daemon still mid-run beside a new bridge would have its run failed and its worktree removed. Stops can take up to 3 s longer while an interrupted schedule run parks its worktree.
- Run `corvidinho doctor` after updating: it now reads the allowlist file (no false `[missing]`); a `data-dir` `[fail]` exits 1, which makes the box updater roll back, while `[warn] llm` and `[info]` lines never fail it. If every allowlisted channel or repo is also deny-listed, doctor now reports `[missing]`.
- Box updater (pidfile mode) now needs `[discord] logged in as …` in `CORVIDINHO_BRIDGE_LOG` within `CORVIDINHO_READY_TIMEOUT` (default 60 s), or it rolls back.
- If you set `DISCORD_RATE_LIMIT_BY_LEVEL`, it now takes effect (2 = any non-owner caller, 3 = the owner) — check the values.
- Once the audit chain holds a keyed row, every process sharing the data dir needs the same `CORVIDINHO_AUDIT_HMAC_KEY`: a process without it refuses dangerous plugin runs and `/admin` changes, and one with a different key breaks the chain.
- `github watch` now exits 1 on a GitHub 401: fix `GITHUB_TOKEN` / `GH_TOKEN` and restart it.
- Test audit rows that verify runs wrote into the live DB before #213 are not cleaned up.
- Everything here except #222 was already on `main` before this bump but is in no earlier section: #206, #207, #209, #211, #212 and #216 landed between the 0.0.26 release and the 0.0.27 bump, the rest after the 0.0.28 bump. None of 0.0.26–0.0.28 was tagged when this was cut; CI has tagged them since (#231, see 0.0.30).

## 0.0.28

### Discord identity lookup + soft-land tool thrash (dogfood)

- **IDENTITY-5 / DISCORD-13** — New read-only `discord-user-lookup` plugin resolves a guild member by snowflake (`--user-id`) or name (`--query`) inside the configured `DISCORD_GUILD_ID` only (refuse other guilds). Prefer this before SpecSync/git/github when chat mentions a Discord person. A bare `bug <snowflake>` in Discord is treated as a user id, not a GitHub issue.
- **AGENT-9** — Tool-round budget exhaustion soft-lands: keep the best prose so far, or ask a brief clarifying question. Never dump `Stopped after N tool rounds` into the Discord channel body (operator note may appear on the thinking/NDJSON path). `chatBodyFromTaskResult` also strips leftover stop lines.
- **ROLES-CHAT-9** — Community Discord chat prefers conversational prose for social/game banter; SpecSync/git/github/files only when the query clearly needs Corvidinho codebase or product data.
- Mentions: `<@id>` in inbound chat is rewritten to `Discord user id <id>` so the snowflake stays available for lookup.

### Ops

- Package version **0.0.28** — restart the Discord bridge after update. No schema bump.

## 0.0.27

### Light agent.3md adopt (docs + dep + smoke)

- **Guidance-only `agent.3md`** at the repo root (Magpie/let convention): identity plane + playbooks for HI-first, Discord ask UX, SpecSync SDD, no-secrets, and SAFE plugins — **no** `tool=` bindings that duplicate the plugin registry.
- **Dependency** `@corvidlabs/agent3md` ^1.0.0; bun smoke (`tests/agent3md.smoke.test.ts`) runs `validateAgent` + `Agent.route` / `Agent.get` on the shipped file.
- **Not** AGENT-13 runtime: does not replace hi/, SpecSync, MEMORY, sessions, or SAFE plugins; progressive disclosure is **not** wired into the agent loop yet (STATUS still waits on AGENT-13 HI).
- HI Notes in `hi/agent.md`; SpecSync REQ-agent-260.

### Ops

- Package version **0.0.27** — docs/dep/smoke only; Discord bridge restart **not** required for presence (no runtime loop change). Optional: pull for the new `agent.3md` catalog on disk.

## 0.0.26

### Daily spend cap — warn at 80%, ask at 100% (SAFE-8 amended, AUTONOMOUS-8)

- **Spend cap** — [#160](https://github.com/CorvidLabs/Corvidinho/pull/160) (#98): set `CORVIDINHO_DAILY_SPEND_CAP_USD` for a rolling 24 h cap on provider LLM spend (per-model price table). At **80%** the owner gets one warning per crossing — whichever surface made the call (chat, `/work`, `/session`, schedules, WATCH, daemon, delegate workers) — delivered by the bridge on its next post, handed back if a post fails, re-armed under 70% / after 24 h / on a cap change. At **100%** the provider call is not sent: the run ends **blocked** with a spend-cap ask and the owner is pinged once per cap episode (fresh post). A spend-cap stop is never shown as "✅ Done" and never stored as a pending clarify question. `corvidinho doctor` and `/status` show 24 h spend vs the cap.

### Crash and restart recovery (from the recovery audit)

- **Scheduler tick errors never crash the bridge** — [#193](https://github.com/CorvidLabs/Corvidinho/pull/193): `SQLITE_BUSY` (or any store error) in a schedule tick is logged as one scrubbed line and the next tick runs (DISCORD-SCHEDULE-4, CLI-8).
- **Interrupted replies** — [#194](https://github.com/CorvidLabs/Corvidinho/pull/194) (DISCORD-3): replies in flight are recorded (schema **v9** `inflight_replies`); after a restart the stale "working…" message is marked interrupted instead of spinning forever.
- **Session park state** — [#197](https://github.com/CorvidLabs/Corvidinho/pull/197) (SESSION-WORKTREE-3): a crash while ending a talk no longer leaves its thread bound to a removed worktree; every turn re-binds (re-creates a missing worktree, never the repo root).
- **Box updater** — [#201](https://github.com/CorvidLabs/Corvidinho/pull/201): a set `CORVIDINHO_BRIDGE_UNIT` wins over a leftover pidfile (no second `nohup` bridge), and the env file is loaded for doctor and rollback restarts.

### Security and correctness

- **Allowlist file** — [#203](https://github.com/CorvidLabs/Corvidinho/pull/203): multi-line TOML arrays load (deny lists written across lines were silently dropped). **A malformed allowlist file now fails closed**: the bridge, watch and daemon refuse to start and GitHub/Discord gates refuse, with the line and key named (never values). `/admin` never writes a file the loader would reject. `doctor` reports the allowlist file.
- **SAFE-3 `cd` clamp fails closed** — [#210](https://github.com/CorvidLabs/Corvidinho/pull/210): redirections, quoting, line continuations, expanded command words and runtime `CDPATH` (read-only in the shell) no longer escape the project root.
- **Agent loop honesty** — [#199](https://github.com/CorvidLabs/Corvidinho/pull/199) (AGENT-4): a failed verify or a provider error is never reported as done; [#202](https://github.com/CorvidLabs/Corvidinho/pull/202): the planning SpecSync briefing reaches the model, not only the event stream.
- **WATCH** — [#195](https://github.com/CorvidLabs/Corvidinho/pull/195): handled event ids are durable, so a restart or a stranger's comment flood no longer replays trusted requests (duplicate acks, summaries and agent runs); [#196](https://github.com/CorvidLabs/Corvidinho/pull/196): comments are read across every page, so @mentions after comment #50 are seen.

### Ops

- Package version **0.0.26** — restart the Discord bridge, `corvidinho daemon` and watch after update. **Schema migrates to v9** on first open (`inflight_replies`). Check your allowlist file with `corvidinho doctor` before restarting: a file the loader cannot parse now stops startup instead of silently falling back to env-only.

## 0.0.25

### Discord ask UX — slash ASK-7 + ephemeral pick cleanup (ASK-8)

- **DISCORD-ASK-7** — `/session start` and `/work` collapse the thinking progress message into the final answer (same as mention/button pick) and delete the deferred slash reply when `editMessage` is available — no extra ✅ Done embed + full interaction reply.
- **DISCORD-ASK-8** — After an ephemeral choice pick: clear option buttons immediately (`components: []`), keep `pendingAsk` cleared so a re-press is expired/no-op, and delete the ephemeral "Got it — Working on it…" once resume finishes.
- `finalizeContent` only closes the thinking controller on a successful edit so Done/fail fallback still works when `editMessage` is missing.
- HI + REQ-discord-048/049.

### Ops

- Package version **0.0.25** — restart the Discord bridge after update. No schema bump.

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

- **Process-tree kill + Fledge scoping** — [#185](https://github.com/CorvidLabs/Corvidinho/pull/185) (#112; merged before the v0.0.22 tag, so the v0.0.22 build already has it): Fledge runs, delegate workers and spawned chat/schedule agents get their own process group; a timeout, abort, parent exit or unhandled SIGINT/SIGTERM/SIGHUP kills the whole tree (including `setsid` grandchildren found via `/proc`), and signals the process started with ignored (SIGHUP under `nohup`) stay ignored. Daemon shutdown now kills runs abandoned after the grace period (CLI-8 / AUTONOMOUS-4). Model argv goes after `--` in `fledge plugins run`, and Fledge commands are bound to the project root they were discovered for (FLEDGE-4, PLUGIN-2/3).

### Security fixes

- **SAFE-3 `cd` clamp** — [#187](https://github.com/CorvidLabs/Corvidinho/pull/187) (already in the v0.0.22 tag): `shell-exec` refuses `cd -`, `cd -P /`, `cd -- /etc`, `{ cd /; }`, keyword forms, `pushd`, `builtin`/`command cd`, `eval "cd …"` and `CDPATH` tricks that escaped the project root.
- **`files-edit` literal `--new`** — [#188](https://github.com/CorvidLabs/Corvidinho/pull/188) (already in the v0.0.22 tag): `$&`, `$1`, `` $` ``, `$'` and `$$` in the replacement are written literally instead of being expanded.
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
- **`/work` and `/session start` project option** — [#177](https://github.com/CorvidLabs/Corvidinho/pull/177): the `project` option can no longer point the agent at an arbitrary git repo on the host; it resolves only to the bridge project root, a directory inside it, or a sibling checkout whose origin OWNER/REPO passes the GitHub repo allowlist (checked on real paths; otherwise "not authorized"). Applies to `/schedule create` and schedule ticks too.
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
- **ROLES-CHAT-8** — Non-ADMIN community sessions may use **any public GitHub** repo through the read tools (the system prompt names the site/roadmap, but `web-fetch` is dangerous and is not offered in chat); **private repos** and **secret paths** (`.env`, keys, keystores) are refused. Deny lists still win. ADMIN keeps the GITHUB-6 allowlist.

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
- **WATCH-RELIABILITY-2** — Persist spawn outcome logging (start, exit code / error class, duration) as a structured `[watch] spawn …` log line and durable JSONL (`CORVIDINHO_WATCH_SPAWN_LOG` or `<data dir>/watch-spawn.jsonl`, data dir = `CORVIDINHO_DATA_DIR` or `~/.local/share/corvidinho`) — readable without Discord.
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
- ADMIN is re-checked in the plugin handler: the bridge's per-dispatch `CORVIDINHO_ACTING_IS_ADMIN=1` is required (scheduled runs never get ADMIN) and the live config must agree — empty `CORVIDINHO_DISCORD_ADMIN_USERS` + `_ROLES` ⇒ nobody; deny-listed/muted users are never ADMIN; admin user id, or admin roles configured (ADMIN-4). Superseded in this same package by owner-only ADMIN ([#141](https://github.com/CorvidLabs/Corvidinho/pull/141), upgrade note above): the live check now requires the configured owner, and no owner ⇒ nobody.
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
- `docs/hi-drafts/WATCH-RELIABILITY.md` — draft only for Leif (post-ack summary, spawn outcome log, 403 backoff); **not** captured to `hi/` here — captured to `hi/watch.md` in 0.0.10.
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
