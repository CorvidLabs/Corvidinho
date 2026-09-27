# STATUS — Corvidinho

**As of:** 2026-09-27 (America/Denver)

| Item | State |
|------|--------|
| Repo | Bootstrap / HI + allowlists + prove-before-done + SpecSync + HEAR + WATCH + LLM tool-loop + **v0.0.2** + **Leif-confirmed HI** + **v0.0.3** updater + **v0.0.4** MEMORY + **v0.0.5** SESSION-WORKTREE + **GitHub write plugins** (#48) + **v0.0.6** files/search plugins (#81) + **v0.0.7** MEMORY Discord inject + **v0.0.8** DISCORD-ANNOUNCE `/announce` + **v0.0.9** memory-ACL hardening / SAFE-6 scrub / spawn `.env` isolation / `/work` restart recovery / IDENTITY-2 owner-only ADMIN (#141) + shell-exec SAFE-3 (#83) + **v0.0.10** WATCH-RELIABILITY-1..3 + **v0.0.11** enriched bridge-live announce (CHANGELOG bullets) + **v0.0.12** typed git tools (#145) / durable WATCH sessions (#142) + **v0.0.13** always-verify Discord/WATCH (#85 AGENT-4 — no `--no-verify` on spawn) + **v0.0.14** ROLES-CHAT tool gates + **v0.0.15** owner-only `/admin` runtime allowlist (ADMIN-1..4, #43/#147) + **v0.0.16** daemon / web-fetch / Fledge tools / PR diff + CI-by-ref / project instructions + **v0.0.17** searchable channel STRING+autocomplete (ADMIN-2 UX / DISCORD-ANNOUNCE-2) + **v0.0.18** ask-human/autonomous + **v0.0.19** dogfood UX (IDENTITY-4 / DISCORD-3.a / ROLES-CHAT-8) + **v0.0.20** AUTONOMY-4..7 (requester ping / thin-ack / cancel / joke decline) + **v0.0.21** security/correctness sweep + council tool + operator guide (#192) + **v0.0.22** ephemeral button asks + per-user sessions (DISCORD-ASK-1..5 / SESSION-MULTI-1..4, #198) + **v0.0.23** stop-means-stop process trees / SAFE-3 cd clamp / scrub-before-clip / GitHub gate reads the allowlist file (#205) + **v0.0.24**/**v0.0.25** ask UX (DISCORD-ASK-6..8, #204/#208) + **v0.0.26** spend cap / crash + restart recovery / fail-closed allowlist file (#217) + **v0.0.27** guidance-only `agent.3md` (#223) + **v0.0.28** Discord user lookup / soft-land tool-round exhaustion (IDENTITY-5 / DISCORD-13 / AGENT-9, #224) + **v0.0.29** slash asks + session continuity / allowlisted-channel gates / secret-path hiding / schedule-run recovery (schema v10) / clean CLI errors / doctor reads the allowlist file (#230) + **v0.0.30** session threads / images to the model / real-diff verify / per-tier models / creator-gated schedule ticks + daemon asks reach Discord (schema v11) / CI-strict spec-check / language runners / CI tags every version (#243) + **v0.0.31** owner-only channel autocomplete / keystore + .specsync/ write protection / audited /schedule delete / per-user thread sessions / failing-step verify feedback / paused schedules ping the owner / presence on every IDENTIFY / SpecSync lists specs/ (#259) + **v0.0.32** allowlisted tools reach the model (shell/runners/Fledge runs wait on SAFE-3) / Fledge core builtins / Choose asks on /work and /session start / open asks kept per askId / role-refusal note / --project / doctor + init name project files (#263) + **v0.0.33** DISCORD-8 acting-user post check / open asks scrubbed at rest + re-scrub (SAFE-6) / watch comment rate limits back off (#267) |
| Default product | Linux-first **headless** Bun/TS agent CLI (any caller execs it; not a product UI) |
| HI | Captured under `hi/` (18 families incl. MEMORY/IDENTITY/ADMIN/AUTONOMY/SESSION/WATCH/ROLES + ALLOW/WALLET; plus DISCORD-SCHEDULE / DISCORD-ANNOUNCE / DISCORD-ASK / DISCORD-DENY / SESSION-WORKTREE / SESSION-MULTI / MEMORY-ACL / ROLES-CHAT / WATCH-RELIABILITY compound ids) — see `hi check` |
| Allowlists | **Default-deny** (empty = refuse). File + env on bot VM; a file that cannot be parsed refuses start (fail closed, #203). See below. |
| Fledge | `fledge.toml` verify lane: lint + smoke + test + **spec-check** (Merlin pattern) |
| SpecSync | Agent tools `specsync-list/read/check/brief/coverage/score/change-list/ship-status` + plan-time briefing; local `spec-check` at CI strictness (`--require-coverage 100`); SDD ON; CI Spec Sync Action still dedicated |
| Trust / Augur / Attest | **Not** wired — do not re-add Trust thrash on this bootstrap |
| Merge policy | Merge when verify + SpecSync change cycle are green (Leif/CoS standing order) |
| Box update | `scripts/corvidinho-update.sh` + `docs/BOX-UPDATE.md` / `docs/UPDATE.md` — pidfile ready-wait + rollback; no Discord panic spam |
| Releases | Every package version gets a `v<version>` tag and a GitHub Release with verbose notes (its CHANGELOG section, the commits since the previous tag, the updater line). When a `package.json` version bump lands on main, `.github/workflows/release.yml` tags the commit that bumped it, so a release PR needs no hand-pushed tag; a missed version is caught up by the next push, a hand-pushed `vX.Y.Z` tag still gets its Release, and a manual run on main (`workflow_dispatch` with `versions`) tags and releases listed versions. Versions 0.0.2 onward are tagged (0.0.1 was the bootstrap); `git ls-remote --tags origin` lists them for `CORVIDINHO_REF` |

## Not inventing

ACCESS, bounty, MainNet product surfaces. No on-chain identity in v1. Do not invent HI/AC.

**HI confirmed + captured (2026-09-26):** Leif approved MEMORY/IDENTITY/ADMIN/AUTONOMY/SESSION + PROCESS. Live acceptance criteria are under `hi/` (`memory.md`, `identity.md`, `admin.md`, `autonomy.md`, `session.md`). `docs/hi-drafts/` is historical — do not treat as pending.

**HI confirmed + captured (2026-09-26, schedule/worktree/memory-ACL):** Leif confirmed DISCORD-SCHEDULE-1..5, SESSION-WORKTREE-1..5, MEMORY-ACL-1..5 with amendment **self-forget also requires ADMIN**. Live in `hi/discord.md`, `hi/session.md`, `hi/memory.md` (+ `hi/admin.md` cross-link). Impl: #57 · #58 · #59 — no code in the HI-capture PR.

**HI confirmed + captured (2026-09-26, DISCORD-ANNOUNCE):** Leif confirmed DISCORD-ANNOUNCE-1..6. Live in `hi/discord.md`. Impl: `/announce` channel|show + persist + bridge-live post to announce-only channel — shipped in [#132](https://github.com/CorvidLabs/Corvidinho/pull/132) (package **0.0.8**; MEMORY inject shipped as **0.0.7** in [#131](https://github.com/CorvidLabs/Corvidinho/pull/131)).


**HI confirmed + captured (2026-09-26, ROLES-CHAT):** Leif confirmed ROLES-CHAT-1..7 (community chat vs ADMIN tool gates; two-tier interim until #65). Live in `hi/roles.md` (+ identity/safe/admin cross-links). Gate impl + tests shipped in [#165](https://github.com/CorvidLabs/Corvidinho/pull/165) (**v0.0.14**), before #43 /admin ([#147](https://github.com/CorvidLabs/Corvidinho/pull/147)).


## Process / governance (PROCESS-1..5)

1. HI-first (draft → confirm → capture)
2. SpecSync SDD + CI Spec Sync Action
3. Autonomous merge on Corvidinho when verify+SpecSync green
4. Respect CODEOWNERS elsewhere
5. Fledge Actions deferred; local `fledge lanes run verify`


## ROADMAP (living)

Honest, issue-tied. Update this section when milestones land — do not invent status.

### Done (cite PRs / issues)

| Slice | Issues → PR | What landed |
|-------|-------------|-------------|
| BOOT | #1 | HI capture + Fledge + SpecSync CI |
| ORIGIN | #2 | Lineage docs (`docs/ORIGIN.md`) |
| Plugin host + GH reads | #6 + #4 → [#15](https://github.com/CorvidLabs/Corvidinho/pull/15) | Fledge plugin host + Octokit typed GH reads + GITHUB-6 deny gate |
| Default-deny allowlists | #16 → [#18](https://github.com/CorvidLabs/Corvidinho/pull/18) | ALLOW/WALLET HI + file/env allowlists (empty = deny-all); wallets deferred |
| Prove-before-done | #7 → [#17](https://github.com/CorvidLabs/Corvidinho/pull/17) | Agent loop refuses done until Fledge verify passes (AGENT-4 / FLEDGE-2) |
| SpecSync agent wiring | #8 → [#22](https://github.com/CorvidLabs/Corvidinho/pull/22) | Plan-time list/read (`spec_loader`) + verify-lane `spec-check`; typed SpecSync plugins |
| HEAR thin | #5 → [#23](https://github.com/CorvidLabs/Corvidinho/pull/23) | Discord bridge: mention→session stub, reply/thread continuity, allowlisted channels; no ProcessManager |
| Attribution helper | #20 → [#24](https://github.com/CorvidLabs/Corvidinho/pull/24) | Shared “Made with Corvidinho” markdown/plain constants + `corvidinho attribution` CLI (no @handles) |
| HEAR thinking status | #10 → [#25](https://github.com/CorvidLabs/Corvidinho/pull/25) | DISCORD-3 edit-in-place progress (elapsed, tool, rough tokens); no ProcessManager |
| HEAR slash commands | #11 → [#26](https://github.com/CorvidLabs/Corvidinho/pull/26) | DISCORD-4 thin `/session` `/status` `/agents` `/work`; channel re-check; no ProcessManager |
| HEAR slash re-register | → [#51](https://github.com/CorvidLabs/Corvidinho/pull/51) | REQ-discord-016: guild PUT of six + clear globals; `discord register-commands`; kills duplicate /agents from stale corvid-agent guild cmds |
| HEAR rate limits + mutes | #12 → [#27](https://github.com/CorvidLabs/Corvidinho/pull/27) | DISCORD-6 per-user sliding window + in-memory mute; peers unaffected; no ProcessManager |
| HEAR admin re-auth + confused-deputy | #13 → [#28](https://github.com/CorvidLabs/Corvidinho/pull/28) | DISCORD-7 run-time minPermission + DISCORD-8 requester View/Send check; no ProcessManager |
| HEAR image attachments + protocol lockstep | #14 → [#29](https://github.com/CorvidLabs/Corvidinho/pull/29) | DISCORD-9 image→local files (MIME/20MB/5) + DISCORD-10 Merlin protocol-version lockstep; no ProcessManager |
| WATCH poll-first ingress | #19 → [#30](https://github.com/CorvidLabs/Corvidinho/pull/30) | GitHub mention/review_request/issue_comment → allowlist → session stub; poll-first for VM; webhook deferred; no ProcessManager |
| WATCH reliability (auto-ack + poll log + summary/spawn/backoff) | 59a92f9 (REQ-watch-007, direct) + [#144](https://github.com/CorvidLabs/Corvidinho/pull/144) | REQ-watch-007 + **WATCH-RELIABILITY-1..3** (`hi/watch.md`): per-cycle counters; auto-ack; **post-run summary** once/event after successful ack; **spawn outcome** JSONL + structured log; **403 rate-limit backoff** (Retry-After/reset, default 60s); ignore own mentions; pagination bury docs |
| GitHub writes + assignee ingress | #48 → [#52](https://github.com/CorvidLabs/Corvidinho/pull/52) | Dangerous Octokit writes: issue create/comment, PR create (attribution footer), PR review; SAFE-1 + GITHUB-6 gates; WATCH `assignment` events from assignees; fixtures/dry-run; no live tokens in CI |
| Discord spawn + dogfood path | → [#32](https://github.com/CorvidLabs/Corvidinho/pull/32) | Always `bun`-invoke `.ts` for protocol + agent spawn (fix EACCES); parse `task run --json` for Discord summary; thin env-gated LLM execute stub |
| LLM tool loop (DOGFOOD) | #31 → [#33](https://github.com/CorvidLabs/Corvidinho/pull/33) | Interruptible OpenAI-compatible plugin tool loop on `task run` (AGENT-3/5); prove-before-done unchanged; fixture mock HTTP; Discord/WATCH keep `--no-verify` |
| v0.0.2 dogfood polish | → [#34](https://github.com/CorvidLabs/Corvidinho/pull/34) | Shared `src/version.ts` from package.json; enriched ephemeral `/status` (LLM model+host / demo stub, slash names, optional git tip); no new slash commands |
| HI drafts folder | #41–#44 → [#47](https://github.com/CorvidLabs/Corvidinho/pull/47) | `docs/hi-drafts/` proposals (superseded by capture) |
| Tag→Release + box updater | → [#45](https://github.com/CorvidLabs/Corvidinho/pull/45) | release Action + `corvidinho-update.sh` |
| HI capture (confirmed) | #41–#44 + #37 SESSION + PROCESS → [#49](https://github.com/CorvidLabs/Corvidinho/pull/49), [#60](https://github.com/CorvidLabs/Corvidinho/pull/60) | Real `hi/` MEMORY/IDENTITY/ADMIN/AUTONOMY/SESSION + PROCESS in AGENTS/STATUS |
| DISCORD-SCHEDULE slash | #57 → [#62](https://github.com/CorvidLabs/Corvidinho/pull/62) | `/schedule` single-project recurring runs (DISCORD-SCHEDULE-1..5); 5m min; ADMIN mutations; cooperative ticker; durable SessionStore/WorkStore + soft TTL shipped in [#61](https://github.com/CorvidLabs/Corvidinho/pull/61) |
| MEMORY SQLite + ACL | #41 + #59 → [#64](https://github.com/CorvidLabs/Corvidinho/pull/64) | Shared DB schema v3 `memories`; per-user Discord ACL; ADMIN-only forget/override incl. self-forget; empty admin deny-all; memory-* plugins; no `/memory` slash; package **0.0.4** |
| MEMORY ACL hardening | #59 follow-up → [#128](https://github.com/CorvidLabs/Corvidinho/pull/128) | Memory plugins take actor/ADMIN only from bridge env (argv `--user`/`--admin`/`--db` refused); handler-time ADMIN re-check (empty = deny-all); two-phase HMAC confirm for forget/override from a new turn (SAFE-4); `--include-deleted` ADMIN-only; Discord/WATCH spawn env hygiene; no schema change |
| SAFE-6 secret scrub | #66 → [#130](https://github.com/CorvidLabs/Corvidinho/pull/130) | Scrub vendor-key shapes on every SQLite write; automatic re-scrub when `SCRUB_RULES_VERSION` rises; SAFE-10 / mnemonics await HI |
| Spawn `.env` isolation | → [#133](https://github.com/CorvidLabs/Corvidinho/pull/133) | `bun --no-env-file` for spawned agents (ALLOW-4 / SAFE-1); tests stop creating real `talk/*` worktrees |
| `/work` restart recovery | #87 → [#135](https://github.com/CorvidLabs/Corvidinho/pull/135) | Abandoned queued/running work failed honestly on start; talk ended (SESSION-WORKTREE-3); queue/locks draft AUTONOMOUS-14 |
| HI: retire human CLI | #129 → [#134](https://github.com/CorvidLabs/Corvidinho/pull/134) | CLI-1/2/6/9 retired; CLI-7/8 kept for the daemon; package **0.0.9** release cut |
| SESSION-WORKTREE isolation | #58 → [#70](https://github.com/CorvidLabs/Corvidinho/pull/70) | Per-talk/project git worktree isolation (SESSION-WORKTREE-1..5); `src/worktree/`; schema v4 session columns; schedule ticks use project scope; package **0.0.5**; Discord bridge restart needed to pick up |
| v0.0.3 updater polish | → [#50](https://github.com/CorvidLabs/Corvidinho/pull/50) | Pidfile stop/start + ready-wait; `docs/UPDATE.md`; release idempotency; builds on [#45](https://github.com/CorvidLabs/Corvidinho/pull/45) |
| Discord presence version | → [#53](https://github.com/CorvidLabs/Corvidinho/pull/53) | DISCORD-12: Custom Status under bot name shows shared `vX.Y.Z` from `src/version.ts` on ClientReady/restart; fixture test; no slash/allowlist churn |
| Live NDJSON event stream | #73 → [#139](https://github.com/CorvidLabs/Corvidinho/pull/139) | `task run --output ndjson`; Discord/WATCH live state/tool/tokens (AGENT-8 / CLI-7 / DISCORD-3); protocol **2** (DISCORD-10); in the **v0.0.10** build |
| IDENTITY owner + owner-only ADMIN | #42 → [#138](https://github.com/CorvidLabs/Corvidinho/pull/138), [#141](https://github.com/CorvidLabs/Corvidinho/pull/141) | Durable owner (IDENTITY-1); ADMIN = owner only, no owner ⇒ nobody (IDENTITY-2/3); admin env lists ignored + warned; in the **v0.0.9** build |
| SAFE-5 audit trail | #95 → [#136](https://github.com/CorvidLabs/Corvidinho/pull/136) | HMAC-chained append-only `audit_log` (schema v5) for dangerous plugin runs; SAFE-17 awaits HI; in the **v0.0.9** build |
| `--task` argv hardening | → [#143](https://github.com/CorvidLabs/Corvidinho/pull/143) | Untrusted bridge text after `--task` never becomes CLI flags (AGENT-5 / SAFE-1); in the **v0.0.10** build |
| Typed git tools | #82 → [#145](https://github.com/CorvidLabs/Corvidinho/pull/145) | status/diff/log + dangerous branch-create/commit/push; SAFE-1/2/3, GITHUB-6 push gate; hooks off; package **0.0.12** |
| Always verify bridges (#85 slice) | #85 → [#155](https://github.com/CorvidLabs/Corvidinho/pull/155) | Discord/WATCH spawn without `--no-verify` (AGENT-4 / FLEDGE-2); empty `filesChanged` still skips lane; CLI flag local-only; package **0.0.13**; draft AGENT-14/15 deferred |
| Durable WATCH sessions | #37 → [#142](https://github.com/CorvidLabs/Corvidinho/pull/142) | Schema v6 `watch_sessions`, soft TTL, restart-safe; clean shutdown + single-flight polls; package **0.0.12** |
| `corvidinho daemon` | #108 → [#157](https://github.com/CorvidLabs/Corvidinho/pull/157) | Headless schedule ticker (CLI-8 / AUTONOMOUS-4); OPS-3..5 drafts wait; package **0.0.16** |
| SSRF-guarded web-fetch | #111 → [#148](https://github.com/CorvidLabs/Corvidinho/pull/148) | SAFE-7 fetch side; dangerous; web-search not captured; package **0.0.16** |
| Fledge plugins as tools | #112 → [#154](https://github.com/CorvidLabs/Corvidinho/pull/154) | FLEDGE-4/5, PLUGIN-3/6; package **0.0.16** |
| GitHub PR diff/files + CI by ref | #93/#94 → [#153](https://github.com/CorvidLabs/Corvidinho/pull/153), [#158](https://github.com/CorvidLabs/Corvidinho/pull/158) | GITHUB-3/4 read halves; GITHUB-10/11 drafts wait; linear SAFE-6 scrub; package **0.0.16** |
| Project instructions in prompt | #84 → [#150](https://github.com/CorvidLabs/Corvidinho/pull/150) | AGENT-1; package **0.0.16** |
| `/work` → draft PR | #88 → [#166](https://github.com/CorvidLabs/Corvidinho/pull/166) | AUTONOMOUS-3 / GITHUB-2/5 / AGENT-4; owner-only (ROLES-CHAT-3); in the **v0.0.17** build |
| Instructions from HEAD | #84 → [#169](https://github.com/CorvidLabs/Corvidinho/pull/169) | AGENT-1 hardening; in the **v0.0.17** build |
| Ask-human + owner ping | #44 → [#163](https://github.com/CorvidLabs/Corvidinho/pull/163) | AUTONOMY-1..3 / AUTONOMOUS-7; schema v7; package **0.0.18** |
| Autonomous gate + delegate | #117 → [#167](https://github.com/CorvidLabs/Corvidinho/pull/167) | AUTONOMOUS-1/5, SAFE-9; package **0.0.18** |
| Bug sweep + councils (0.0.21) | #175–#184, #186 → [#192](https://github.com/CorvidLabs/Corvidinho/pull/192) | Actor allowlist/deny gating, /work project clamp, schedule worktree isolation + safe branch cleanup, TTL never parks a live run, pinned Bun config, attachments in root, symlink clamp, `--` argv kept; council tool (#118); /admin + pr-diff edges; operator guide; package **0.0.21** |
| Ephemeral Discord button asks (0.0.22) | DISCORD-ASK / SESSION-MULTI → [#198](https://github.com/CorvidLabs/Corvidinho/pull/198) | Choose stub + ephemeral option buttons (~30m TTL); per-user sessions; ask-human options; package **0.0.22** |
| Stop-means-stop + security fixes (0.0.23) | #185 #187 #188 #190 #191 → [#205](https://github.com/CorvidLabs/Corvidinho/pull/205) | Process-tree kill on timeout/abort/exit/signals (AGENT-3), daemon kills abandoned runs, Fledge `--` + per-project binding; SAFE-3 cd clamp bypasses; files-edit literal `$`; scrub-before-clip (SAFE-6); GitHub gate honours allowlist-file deny lists (GITHUB-6); package **0.0.23** (#185/#187/#188 merged before the v0.0.22 tag, so the v0.0.22 build already has them) |
| Ask UX: Choose stub collapse (0.0.24) | → [#204](https://github.com/CorvidLabs/Corvidinho/pull/204) | DISCORD-ASK-6/7: thinking embed collapses into one public Choose stub; the stub/thinking message is edited into the final answer; package **0.0.24** |
| Ask UX: slash one-message + pick cleanup (0.0.25) | → [#208](https://github.com/CorvidLabs/Corvidinho/pull/208) | DISCORD-ASK-7 for `/session start` + `/work`; DISCORD-ASK-8 ephemeral pick cleanup; package **0.0.25** |
| Spend cap + recovery + security (0.0.26) | #160 #193 #194 #195 #196 #197 #199 #201 #202 #203 #210 → [#217](https://github.com/CorvidLabs/Corvidinho/pull/217) | SAFE-8 warn 80% / ask 100% + AUTONOMOUS-8 spend in doctor & /status; tick errors never crash the bridge; interrupted replies marked (schema v9); park state; updater single bridge; allowlist multi-line TOML + fail closed; SAFE-3 clamp fail-closed; verify/provider errors never "done"; WATCH durable dedup + pagination; package **0.0.26** |
| Light agent.3md adopt (0.0.27) | → [#223](https://github.com/CorvidLabs/Corvidinho/pull/223) | Root guidance-only `agent.3md` + `@corvidlabs/agent3md` + validate/route smoke (REQ-agent-260); **not** AGENT-13 runtime — progressive disclosure still waits on separate HI; package **0.0.27** |
| Discord user lookup + soft-land (0.0.28) | IDENTITY-5 / AGENT-9 / DISCORD-13 / ROLES-CHAT-9 → [#224](https://github.com/CorvidLabs/Corvidinho/pull/224) | `discord-user-lookup` (configured guild only); soft-land tool-round exhaustion (no `Stopped after N` in channel); chat prefers prose over SpecSync thrash; package **0.0.28** |
| Asks + access + secrets + schedule recovery + clean CLI (0.0.29) | #206 #207 #209 #211 #212 #213 #214 #215 #216 #218 #219 #220 #221 #222 #225 #227 #228 #229 → [#230](https://github.com/CorvidLabs/Corvidinho/pull/230) | Slash answers continue their session and keep a run's ask pending (AUTONOMY-1/5/6); collapsed answers ping with one fresh post; talk worktree ids no longer collide; forward/other-channel messages and ask presses gated to allowlisted channels; `/session list` own sessions only, no host paths; DISCORD-6 rate limit by level, no self/owner mute, one refusal notice per window; secret paths hidden from search-grep/files-list/files-glob/git-diff (ROLES-CHAT-8); specsync-read/brief clamped to the project; tests never write the operator data dir, verify lane never sees operator secrets; schedule runs never stuck `running` + startup recovery (schema v10 `schedule_runs.runner`); updater ready gate needs the Discord login line; doctor reads the allowlist file + `llm`/`data-dir` lines; clean one-line CLI errors, watch stops on 401; keyed audit downgrade caught; audit writes take the write lock up front; `task run` SIGINT/SIGTERM + 10 min LLM timeout (AGENT-3); operator docs refresh; package **0.0.29** |
| Session threads + images + real-diff verify + schedule asks + runners (0.0.30) | #226 #231 #234 #235 #236 #237 #238 #239 #240 #241 → [#243](https://github.com/CorvidLabs/Corvidinho/pull/243) | Discord sessions keep their thread: turns stored per session (`discord_session_turns`, scrubbed) and replayed into continued runs within 6000 chars, opening request + newest turns kept (AGENT-6); files-read gives images to the model as image parts, one text-note retry for models that refuse them (DISCORD-9); verify gate uses the run's real git working-tree diff, so shell-only edits are verified (AGENT-4); per-tier model keys `CORVIDINHO_LLM_MODEL_READ/_TOOL/_CODE`, SAFE-8 ask and doctor follow them (AGENT-5); schedule ticks re-check the creator against the live allowlist and the daemon re-reads the allowlist before every tick (DISCORD-SCHEDULE-3); daemon-claimed schedule asks recorded on the run row and posted once by the bridge tick, creator + channel gated (schema v11 `schedule_runs` ask columns; AUTONOMY-2 / AUTONOMOUS-7); local spec-check at CI strictness (`--require-coverage 100`), specsync-check falls back to `specsync check`, `specsync score` (SPECSYNC-2/3); node/python/cargo runner plugins when the toolchain is on PATH (PLUGIN-4); SAFE-3 cd clamp reads comments, here-docs, continuations, `$'…'` and `sh -c` strings the way the shell does; CI tags every package version and creates its Release (v0.0.12–v0.0.29 backfilled); package **0.0.30** |
| Per-user thread sessions + autocomplete gate + schedule pause asks + SAFE-2/5 fixes + failing-step verify feedback (0.0.31) | #244 #245 #246 #247 #248 #249 #250 #251 #252 → [#259](https://github.com/CorvidLabs/Corvidinho/pull/259) | Thread sessions keyed by (thread, user): a second user's @mention no longer takes over the first user's plain-message continuation, holds with an open button ask, after the other session ends and across a restart, no schema change (SESSION-MULTI-1/2); channel autocomplete for `/admin channels add/remove` and `/announce channel` answers an empty list unless the invoker is ADMIN (owner, not muted) in an allowlisted channel, fail closed, no rate-limit slot (DISCORD-DENY-3 / ADMIN-4); version Custom Status rides every gateway IDENTIFY, also on the DISCORD-8 requester-check login (DISCORD-12); the run that auto-pauses a schedule and runs that cannot start (project resolve / worktree failure) record a stuck ask on the run row, owner pinged once per question, path-free fixed questions, pause ask handed back when its post fails (AUTONOMY-2); `/schedule delete` appends `started` then `ok`/`error` audit rows (`denied` for non-ADMIN) and refuses when the trail is unavailable (SAFE-5); file tools refuse any `keystore` path component below the project root and `.specsync/` state outside active change folders, `git-commit` follows (SAFE-2); verify retry feedback keeps the failing step (fledge step name, failure lines first, colour escapes dropped, end of log) within 4000 chars (AGENT-4.a); `specsync-list` and the Planning briefing list `specs/<name>/<name>.spec.md` modules plus registry names in a SpecSync project (SPECSYNC-1/5); ADMIN role-session `github-pr-create` SAFE-1 / GITHUB-6 gate test (ROLES-CHAT-7); schema stays v11; package **0.0.31** |
| Allowlisted tools reach the model + Fledge core builtins + slash Choose asks + open asks kept + role note + --project + doctor/init project files (0.0.32) | #253 #254 #255 #256 #257 #258 #260 #261 #262 → [#263](https://github.com/CorvidLabs/Corvidinho/pull/263) | A button-pick resume injects the presser's Discord display name / username like a chat message, owner map display still wins for the owner, a press with no names injects the id only, nothing stored (IDENTITY-4); pending asks keyed by askId: a later run that asks again no longer replaces an open Choose ask, a press matches its own ask, a pick / late press / free-text answer clears only that ask and the newest unexpired one becomes current, cancel clears all, stored as one object or a JSON array in `discord_sessions.pending_ask`, no schema bump (SESSION-MULTI-3); `/work` and `/session start` answer a clarify/stuck ask whose choices can be listed with the chat's Choose stub and ephemeral pick that resumes the session in the stub, button kept on the fallback reply and the owner-notice re-edit, free text when options cannot be listed, spend-cap never a button ask, schedules stay text (DISCORD-ASK-1/4); the collapsed final answer keeps a footer-only embed `model \| state=… verified=… [verifySkipped] [cancelled] attempts=…` coloured as the fallback status, Choose stub embed-free, SAFE-8 notice re-edit keeps it (DISCORD-3.a); global `--project <path>` runs the CLI as if started in `<path>` (its `.env*` loaded as Bun would there, start dir's `.env` values dropped, set vars win, chdir, spawned tools get the project env, agents keep `--no-env-file`, one error line + exit 1 on a bad path) (CLI-5); `doctor` reports `fledge.toml`, a `verify-lane` that runs spec-check, `.specsync`, `specs` in plain language with the creating command, `[missing]` fails, new report-only `corvidinho init` (llm, fledge, specsync, project files; creates nothing) (CLI-4); a non-ADMIN session's invented call to a mutating/dangerous plugin gets the role refusal (exit 2, `not allowed for your role`) instead of the catalog refusal, ADMIN re-checked per call, summary ends with `(not allowed for your role)` once, kept through the 4000/1800 caps (ROLES-CHAT-3); `task run` offers a dangerous plugin to ADMIN and local runs when `CORVIDINHO_ALLOWLIST` names it and its tier fits, never `shell-exec` / `node-exec` / `python-exec` / `cargo-exec` (SAFE-3 pending, later joined by the Fledge core runs), Fledge discovered only for an allowlisted `fledge-*` in a non-role session, a non-git run that called one verifies anyway (CLI-3, GITHUB-1/3, ROLES-CHAT-4, PLUGIN-3, AGENT-4); Fledge itself as typed builtins: read-only `fledge-lanes-list` / `fledge-lanes-validate` (typed results, lane sources must resolve inside the project root) and dangerous code-tier `fledge-lanes-run` / `fledge-run` (argv only, name regex, scrubbed env, timeouts, output caps, abort kill), which join the SAFE-3 hold-out so a task run never offers them from the allowlist; a core name starts no Fledge discovery (PLUGIN-1, PLUGIN-2); schema stays v11; package **0.0.32** |
| DISCORD-8 acting-user post check + open asks scrubbed at rest + watch comment rate-limit backoff (0.0.33) | #264 #265 #266 → [#267](https://github.com/CorvidLabs/Corvidinho/pull/267) | In a bridge-started run (`CORVIDINHO_ACTING_DISCORD_USER_ID` set) `discord-post-message` always runs the requester check (View Channel + Send Messages) for the acting user after the channel allowlist, with or without `--requesting-user-id`, and that satisfies strict mode; any `--requesting-user-id` / `--requester` value naming another user (either alias, repeated flag) is refused (exit 3) and never checked; a check that cannot run (Guild Members login refused because Server Members Intent is off, timeout, error) fails closed with one scrubbed line naming the intent, nothing posted; operator `plugins run` / local `task run` without an acting user unchanged, WATCH still refused by ROLES-CHAT-3 (DISCORD-8); `discord_sessions.pending_ask` question, option labels and (backstop) option ids scrubbed to `[redacted:<kind>]` on save in the object and array row, askId / expiresAt / option ids / stubMessageId byte-identical so open buttons keep working, a secret-looking model option id becomes its position when the ask is made, in-memory ask unscrubbed until reload; `SCRUB_RULES_VERSION` 2→3 re-scrubs `pending_ask` once as JSON (`scrubJsonText`: every string value, keys kept, rewritten only when changed, stays valid JSON), a non-JSON value is scrubbed as text and counted (`jsonUnparsed`, one `[scrub] <table>.<column>: N …` warning, never the text) (SAFE-6); a 403/429 rate limit on the WATCH auto-ack or run-summary comment keeps its status and the three rate-limit headers and sets the poll backoff (Retry-After, else x-ratelimit-reset, else 60 s) with the `[watch] github rate-limit backoff` line after `ack failed` / `summary failed`, next poll skipped until it ends, current cycle and agent run not cut short, plain 403 only logged, failed comments still not retried (WATCH-RELIABILITY-3, WATCH-RELIABILITY-1 unchanged); schema stays v11; package **0.0.33** |
| Discord deny polish | → [#54](https://github.com/CorvidLabs/Corvidinho/pull/54) | DISCORD-DENY-1..3: MessageCreate silent outside allowlist; slash admin ephemeral tip / non-admin zero-width ack; [`docs/discord.md`](docs/discord.md) slash+outbound+deny mermaid |
| Files/search plugins + SAFE-2 | #81 → [#127](https://github.com/CorvidLabs/Corvidinho/pull/127) | `files-read/write/edit/glob/list/delete` + `search-grep`; path clamp; SAFE-2 protected infra refuse; package **0.0.6**; Discord restart for presence only |
| Shell plugin + SAFE-3 cwd clamp | #83 → [#140](https://github.com/CorvidLabs/Corvidinho/pull/140) | Typed `shell-exec` dangerous/code; spawn cwd pin + lexical cd/pushd refuse (SAFE-3); SAFE-1 allowlist; package **0.0.9** |
| DISCORD-ANNOUNCE slash | → [#132](https://github.com/CorvidLabs/Corvidinho/pull/132) | `/announce` channel|show (CHANNEL picker); persist announce channel id on shared SQLite; bridge-live posts **only** to announce channel (not dogfood allowlist); ADMIN mutations; package **0.0.8**; Discord restart + slash re-register |
| Runtime `/admin` allowlist | #43 → [#147](https://github.com/CorvidLabs/Corvidinho/pull/147) | Owner-only `/admin users|channels|config` (ADMIN-1..4); CHANNEL picker; atomic allowlist.toml writes; package **0.0.15**; re-register slash |
| MEMORY Discord auto-recall inject | draft #67 behavior under AGENT-7/MEMORY-2/4 → [#131](https://github.com/CorvidLabs/Corvidinho/pull/131) | Spawn prepends recalled memories; system prompt store/recall rules; richer tool argv; package **0.0.7**; Discord restart + channel update |
| Announce CHANGELOG bullets | → [#151](https://github.com/CorvidLabs/Corvidinho/pull/151) | DISCORD-ANNOUNCE-4 bridge-live note with ≤5 CHANGELOG bullets; package **0.0.11** |
| ROLES-CHAT tool gates | HI [#159](https://github.com/CorvidLabs/Corvidinho/pull/159) → [#165](https://github.com/CorvidLabs/Corvidinho/pull/165) | Non-ADMIN sessions get read/chat tools only; run-time "not allowed for your role"; package **0.0.14** |
| Searchable channel options | → [#170](https://github.com/CorvidLabs/Corvidinho/pull/170) | `/admin channels add`/`remove` + `/announce channel` use STRING + autocomplete; package **0.0.17** |
| Dogfood UX | → [#173](https://github.com/CorvidLabs/Corvidinho/pull/173) | IDENTITY-4 acting-user inject, DISCORD-3.a plumbing-free replies, ROLES-CHAT-8 public GitHub reads; package **0.0.19** |
| Autonomy clarify UX | → [#189](https://github.com/CorvidLabs/Corvidinho/pull/189) | AUTONOMY-4..7 requester ping, thin-ack, cancel, joke decline; schema v8; package **0.0.20** |

### In flight / next

| Order | Issue | Notes |
|-------|-------|--------|
| Done | [#81](https://github.com/CorvidLabs/Corvidinho/issues/81) PLUGIN files/search + SAFE-2 | Shipped [#127](https://github.com/CorvidLabs/Corvidinho/pull/127) — package **0.0.6** |
| **Done (cut-order)** | MEMORY Discord inject (AGENT-7 / MEMORY-2/4; draft #67) | Shipped [#131](https://github.com/CorvidLabs/Corvidinho/pull/131) — auto-recall prepend + system prompt + tool argv; package **0.0.7** |
| Done | [#83](https://github.com/CorvidLabs/Corvidinho/issues/83) shell-exec + SAFE-3 | Shipped [#140](https://github.com/CorvidLabs/Corvidinho/pull/140) — package **0.0.9** |
| Done | [#82](https://github.com/CorvidLabs/Corvidinho/issues/82) typed git tools | Shipped [#145](https://github.com/CorvidLabs/Corvidinho/pull/145) — package **0.0.12** |
| Done | Slash guild PUT=6 + global `[]` | Landed [#51](https://github.com/CorvidLabs/Corvidinho/pull/51) |
| Done | Discord deny polish (DENY-1..3) + `docs/discord.md` | Landed [#54](https://github.com/CorvidLabs/Corvidinho/pull/54) |
| Done | [#58](https://github.com/CorvidLabs/Corvidinho/issues/58) SESSION-WORKTREE | Shipped (worktree manager + Discord/schedule wire + schema v4); package **0.0.5** |
| Ops | [#19](https://github.com/CorvidLabs/Corvidinho/issues/19) GH go-live + [#48](https://github.com/CorvidLabs/Corvidinho/issues/48) writes | Token + username + allowlists + `github watch`; write plugins in [#52](https://github.com/CorvidLabs/Corvidinho/pull/52) — need `CORVIDINHO_ALLOWLIST` for ACT |
| Done | [#41](https://github.com/CorvidLabs/Corvidinho/issues/41) MEMORY + [#59](https://github.com/CorvidLabs/Corvidinho/issues/59) MEMORY-ACL | Shipped [#64](https://github.com/CorvidLabs/Corvidinho/pull/64) (schema v3 + ACL + plugins; package 0.0.4); ACL hardening [#128](https://github.com/CorvidLabs/Corvidinho/pull/128) (0.0.9) |
| Done | [#42](https://github.com/CorvidLabs/Corvidinho/issues/42) IDENTITY-1..3 | Owner record [#138](https://github.com/CorvidLabs/Corvidinho/pull/138) + owner-only ADMIN [#141](https://github.com/CorvidLabs/Corvidinho/pull/141); owner extras (#36/#96/#44) await HI |
| Done | [#73](https://github.com/CorvidLabs/Corvidinho/issues/73) NDJSON stream | [#139](https://github.com/CorvidLabs/Corvidinho/pull/139) |
| Done (slice) | [#85](https://github.com/CorvidLabs/Corvidinho/issues/85) always-verify bridges | Discord/WATCH drop `--no-verify` ([#155](https://github.com/CorvidLabs/Corvidinho/pull/155) / **0.0.13**); draft AGENT-14/15 still open |
| Done | [#43](https://github.com/CorvidLabs/Corvidinho/issues/43) ADMIN-1..4 | [#147](https://github.com/CorvidLabs/Corvidinho/pull/147) / **v0.0.15** |
| Done | [#44](https://github.com/CorvidLabs/Corvidinho/issues/44) AUTONOMY-1..3, [#93](https://github.com/CorvidLabs/Corvidinho/issues/93)/[#94](https://github.com/CorvidLabs/Corvidinho/issues/94) GitHub reads, [#111](https://github.com/CorvidLabs/Corvidinho/issues/111) web-fetch, [#112](https://github.com/CorvidLabs/Corvidinho/issues/112) Fledge plugins, [#108](https://github.com/CorvidLabs/Corvidinho/issues/108) daemon, [#117](https://github.com/CorvidLabs/Corvidinho/issues/117) delegate, [#88](https://github.com/CorvidLabs/Corvidinho/issues/88) issue→PR | Shipped #163, #153/#158, #148, #154, #157, #167, #166 (0.0.16–0.0.18); drafts beyond captured HI still wait for Leif |
| Go-live | [#5](https://github.com/CorvidLabs/Corvidinho/issues/5) HEAR **live** | Token + channel allowlists on VM |
| Defer | [#9](https://github.com/CorvidLabs/Corvidinho/issues/9) iced/billing/Windows; WALLET ACT | Explicit do-not-steal-now |

### Leif config moments

**PREPARE NOW (no secrets required in repo):**

- Draft `~/.config/corvidinho/allowlist.toml` (copy shape from **Allowlists** below) for GH orgs/repos/users and Discord channels/roles/users — write the file **empty/deny-all** today; fill lists when ready
- Decide Discord channel IDs + admin/user IDs + GH allowlists offline

**GO-LIVE for Discord HEAR (#5 thin shipped):**

- `DISCORD_TOKEN` or `DISCORD_BOT_TOKEN` in VM env/secret store (never commit)
- Non-empty Discord channel allowlist: `DISCORD_CHANNEL_IDS` and/or `CORVIDINHO_DISCORD_ALLOW_CHANNELS` / `~/.config/corvidinho/allowlist.toml` `[discord].channels` — empty = refuse start (not Merlin BASIC)
- Optional user/role allowlists: both empty = anyone in an allowlisted channel may chat; once either has entries only listed users/role holders (and the owner) pass; deny lists always win
- Then: `corvidinho discord bridge` (or `CORVIDINHO_DISCORD_DRY_RUN=1` with any non-empty `DISCORD_TOKEN` value for a no-connect dry-run)

**GitHub secrets useful when:**

- `GITHUB_TOKEN` / `GH_TOKEN` — useful **NOW** for typed read plugins **and** WATCH poll (`corvidinho github watch`)
- `CORVIDINHO_WATCH_USERNAME` — GitHub login to listen for (WATCH go-live)
- Non-empty `CORVIDINHO_GITHUB_ALLOW_REPOS` / `_ORGS` / `_USERS` (or allowlist file)
- Webhook secret + public URL — **follow-up** when deploying webhook ingress (poll-first is the VM default; see `docs/WATCH.md`)

### Discord @bot + reply → session

Thin slice **landed** (`corvidinho discord bridge`). Live @bot works **only after** the VM has token + non-empty Discord allowlists (see go-live below).

### GitHub mention / assign → agent response → comment → PR

**Poll thin slice landed** (`corvidinho github watch`) — [#19](https://github.com/CorvidLabs/Corvidinho/issues/19). **Assignee ingress + write plugins** — [#48](https://github.com/CorvidLabs/Corvidinho/issues/48): `assignment` events when watch user is assignee; dangerous `github-issue-create` / `github-issue-comment` / `github-pr-create` / `github-pr-review` (SAFE-1 allowlist + GITHUB-6). Live listen needs token + username + non-empty GH repo/org and user allowlists. Ack and summary comments are posted by the poller itself. The write plugins are never offered to WATCH or non-owner Discord agent runs (non-ADMIN, ROLES-CHAT-2); `CORVIDINHO_ALLOWLIST` lets `corvidinho plugins run` and the /work draft-PR step use them and offers them to the model in the owner's Discord runs and local `task run` (CLI-3). No reply to random mentions (ALLOW-1). Webhook deferred (poll-first for VM; see `docs/WATCH.md`).

### “Made with Corvidinho” attribution

[#20](https://github.com/CorvidLabs/Corvidinho/issues/20) → [#24](https://github.com/CorvidLabs/Corvidinho/pull/24) **shipped** (`corvidinho attribution` + shared helpers). Use on PR bodies; never @handles.

**HARD RULE (Leif):** attribution is plain text + markdown link **only**:

```text
Made with Corvidinho — https://github.com/CorvidLabs/Corvidinho
```

or markdown:

```markdown
Made with [Corvidinho](https://github.com/CorvidLabs/Corvidinho)
```

**NEVER** use `@Corvidinho` or any `@handle` in the footer (GitHub may notify unrelated users). Helpers shipped in #24; keep using them.

### DOGFOOD / RUNNER (headless CLI flip)

**What Corvidinho is:** a **headless agent CLI** — any caller can `exec` `corvidinho` / Bun entry (Grok bots, Discord bridge, GH ingress, scripts). Dogfood ≠ waiting for a Corvidinho product UI. Bridges are just other callers of the same CLI.

**First flip:** CoS / Corvidinho-bot (Grok stack) shells into `corvidinho` for *real* work — not only Cursor/Grok authoring PRs *into* this repo. Same binary later for Discord/GH callers.

**Useful order (not “become a separate product”):** SpecSync wiring (**#8**) and Discord HEAR thin (**#5**) make the CLI more useful for live callers; they are capability unlocks, not a product-UI gate. Flip when the Grok bot path can honestly exec the CLI for work.

**Honest gaps before first flip (not inventing HI):**

- Full LLM tool loop on top of prove-before-done — **shipped** [#31](https://github.com/CorvidLabs/Corvidinho/issues/31) (thin MVP: env-gated OpenAI tools → plugins; read/tool/code tier; SAFE-1 deny unchanged). Remaining gaps: Discord sessions keep their thread within the soft TTL (AGENT-6, REQ-discord-072: turns stored per session and replayed, bounded, into continued runs), but CLI `task run` has no session resume (CLI-6), a WATCH (GitHub) continue still carries only the newest event, and long threads are elided, not summarised (#72 drafts SESSION-5/6 are not captured); no mid-run tier escalation; `task run` offers a dangerous tool to the model only when `CORVIDINHO_ALLOWLIST` names it, never `shell-exec` or the language runners (SAFE-1 / CLI-3, SAFE-3 decision pending). MEMORY (#64/#131), the NDJSON event stream (#139) and the files/search plugins (#127) shipped
- SpecSync agent tools (#8→#22) so the live CLI can list/read/check specs — **shipped**
- For Discord callers: HEAR (#5) **live on Leif's box** (token + allowlists); bun-spawn for `.ts` fixed in [#32](https://github.com/CorvidLabs/Corvidinho/pull/32)
- For GH @mention callers: WATCH poll (#19) shipped — still needs VM token + username + allowlists; webhook optional later
- Attribution (#20→#24) on outbound PRs — **shipped**
- Package version: `corvidinho version`; per-version notes in `CHANGELOG.md` (updater pidfile/ready + release idempotency landed in 0.0.3, [#50](https://github.com/CorvidLabs/Corvidinho/pull/50); shared version + richer Discord `/status` in 0.0.2, [#34](https://github.com/CorvidLabs/Corvidinho/pull/34))
- Secrets stay in env/secret store; default-deny allowlists stay empty=refuse

### Phased milestones

1. **Foundation** — done (#1, #2, #15, #18)
2. **Prove loop** — done (#17)
3. **SpecSync wiring** — #8 → #22 — done
4. **Discord HEAR** — #5 → #23 thin shipped (go-live = token + allowlists on VM)
5. **Attribution** — #20 → #24 shipped
6. **DOGFOOD / RUNNER** — first flip: CoS/Corvidinho-bot execs headless CLI (#8/#5 help; not a UI milestone)
7. **Discord polish** — #10→#25 thinking; #11→#26 slash; #12→#27 rate/mute; #13→#28 admin; #14→#29 image+protocol
8. **GH mention ingress** — #19 WATCH poll shipped (webhook follow-up); write plugins shipped (#52); /work draft PR (#166)
9. **Ops + autonomy** — daemon #157, /admin #147, ask-human #163, autonomous gate/delegate #167, council #180, button asks #198
10. **Deferred** — #9, wallets

Attribution #20→#24 already shipped.

## Allowlists on the bot VM (ALLOW-4)

Default-deny everywhere: **empty/missing allowlist refuses** targeted GitHub plugin runs and Discord channel posts/listens. Deny overrides always win. **Never** treat empty as allow-all (forbid Merlin empty-permissions → BASIC).

1. Write a config file (preferred), e.g. `~/.config/corvidinho/allowlist.toml`:

```toml
[github]
orgs = ["CorvidLabs"]
repos = ["CorvidLabs/Corvidinho"]
users = ["0xLeif"]
deny_repos = []

[discord]
channels = ["123456789012345678"]
roles = []   # role snowflakes, not names; once users or roles has entries, only listed users / role holders (and the owner) pass
users = []
```

   Or JSON with the same shape. Override path with `CORVIDINHO_ALLOWLIST_FILE`. Lists may span lines. A file that exists but cannot be read or parsed **fails closed**: the bridge, `github watch` and `daemon` refuse to start and the gates refuse (never an env-only fallback); `corvidinho doctor` shows the line and key.

2. Optional env overlays (union onto file when non-empty):
   - `CORVIDINHO_GITHUB_ALLOW_REPOS` / `_ORGS` / `_USERS`
   - `CORVIDINHO_GITHUB_DENY_REPOS` / `_ORGS` / `_USERS`
   - `CORVIDINHO_DISCORD_ALLOW_CHANNELS` / `_ROLES` / `_USERS`
   - `CORVIDINHO_DISCORD_DENY_*`

Secrets (`DISCORD_TOKEN`, `GITHUB_TOKEN`, …) stay in env/secret store — never in the allowlist file committed to git.

### AlgoChat / wallets — deferred

WALLET-1..3 captured in `hi/allow.md`. **No wallet ACT** until an approved-wallet allowlist exists. HEAR channel (#23) and actor user/role/deny (#176) allowlist checks are wired.



## READY-FOR-SECRETS (Discord HEAR)

**Milestone:** bridge code accepts token + non-empty allowlists end-to-end; docs/templates shipped; doctor/bridge fail cleanly without secrets.

| Gate | State |
|------|--------|
| `corvidinho discord bridge` thin slice | **Shipped** (#23 / #5) |
| `.env.example` + `allowlist.example.toml` | **Shipped** (no secret values) |
| `docs/DISCORD-GO-LIVE.md` (Developer Portal + VM paths) | **Shipped** |
| `docs/discord.md` (slash / outbound / deny UX; mermaid docs-only) | **Shipped** (#54) |
| Doctor: missing token / empty channels | **Shipped** (clear exit / refuse start) |
| Live token in VM | **Done on Leif's box** (corvid-agent#1110) — keep secrets in secret store only |
| Non-empty channel IDs on VM | **Done on Leif's box** — keep allowlists default-deny elsewhere |

**Ping CoS/Leif for secrets ONLY when this milestone is green in code** (merge + doctor checklist ready). Do not ask for tokens before READY-FOR-SECRETS.

## Discord HEAR go-live checklist

Code for #5 is in-tree. Live Discord still needs secrets on the bot VM:

1. `export DISCORD_TOKEN=…` or `DISCORD_BOT_TOKEN=…` (secret store; never commit)
2. Non-empty channels: `DISCORD_CHANNEL_IDS=…` **or** allowlist file / `CORVIDINHO_DISCORD_ALLOW_CHANNELS`
3. Optional: `CORVIDINHO_DISCORD_ALLOW_USERS` / `_ROLES` (both empty = anyone in an allowlisted channel; once either is set, only listed users / role holders + the owner)
4. `corvidinho doctor` — Discord check should go green
5. `corvidinho discord bridge`

Fixture/unit tests cover mention→session, reply/thread continuity, and allowlist refuse without a live token. Do not block merge on missing token.

## Next

See **ROADMAP** above. Short pointers:

- #5 HEAR **live on Leif's box** (corvid-agent#1110); bun-spawn `.ts` fix (#32); summaries now come from the NDJSON result frame (#139)
- #19 WATCH poll shipped — set `GITHUB_TOKEN` + `CORVIDINHO_WATCH_USERNAME` + GH allowlists; webhook follow-up later
- Flesh full LLM tool loop — **done** [#31](https://github.com/CorvidLabs/Corvidinho/issues/31) (thin MVP; see DOGFOOD remaining gaps)
- #9 / wallets deferred
- Keep secrets out of repo; keep verify lane honest; no Trust/attest on bootstrap

## Verify locally

```bash
hi check
bun test
bun src/cli.ts --help
bun src/cli.ts specsync list
bun src/cli.ts plugins list
fledge lanes run verify --non-interactive
```
