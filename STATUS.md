# STATUS — Corvidinho

**As of:** 2026-09-26 (America/Denver)

| Item | State |
|------|--------|
| Repo | Bootstrap / HI + allowlists + prove-before-done + SpecSync + HEAR + WATCH + LLM tool-loop + **v0.0.2** + **Leif-confirmed HI** + **v0.0.3** updater + **v0.0.4** MEMORY + **v0.0.5** SESSION-WORKTREE + **GitHub write plugins** (#48) + **v0.0.6** files/search plugins (#81) + **v0.0.7** MEMORY Discord inject + **v0.0.8** DISCORD-ANNOUNCE `/announce` + **v0.0.9** memory-ACL hardening / SAFE-6 scrub / spawn `.env` isolation / `/work` restart recovery / IDENTITY-2 owner-only ADMIN (#141) + shell-exec SAFE-3 (#83) + **v0.0.10** WATCH-RELIABILITY-1..3 + **v0.0.11** enriched bridge-live announce (CHANGELOG bullets) + **v0.0.12** typed git tools (#145) / durable WATCH sessions (#142) + **v0.0.13** always-verify Discord/WATCH (#85 AGENT-4 — no `--no-verify` on spawn) + **v0.0.14** ROLES-CHAT tool gates + **v0.0.15** owner-only `/admin` runtime allowlist (ADMIN-1..4, #43/#147) + **v0.0.16** daemon / web-fetch / Fledge tools / PR diff + CI-by-ref / project instructions + **v0.0.17** searchable channel STRING+autocomplete (ADMIN-2 UX / DISCORD-ANNOUNCE-2) + **v0.0.18** ask-human/autonomous + **v0.0.19** dogfood UX (IDENTITY-4 / DISCORD-3.a / ROLES-CHAT-8) + **v0.0.20** AUTONOMY-4..7 (requester ping / thin-ack / cancel / joke decline) |
| Default product | Linux-first **headless** Bun/TS agent CLI (any caller execs it; not a product UI) |
| HI | Captured under `hi/` (18 families incl. MEMORY/IDENTITY/ADMIN/AUTONOMY/SESSION/WATCH/ROLES + ALLOW/WALLET; plus DISCORD-SCHEDULE / SESSION-WORKTREE / MEMORY-ACL / DISCORD-DENY / ROLES-CHAT compound ids) — see `hi check` |
| Allowlists | **Default-deny** (empty = refuse). File + env on bot VM. See below. |
| Fledge | `fledge.toml` verify lane: lint + smoke + test + **spec-check** (Merlin pattern) |
| SpecSync | Agent tools `specsync-list/read/check/brief` + plan-time briefing; SDD ON; CI Spec Sync Action still dedicated |
| Trust / Augur / Attest | **Not** wired — do not re-add Trust thrash on this bootstrap |
| Merge policy | Merge when verify + SpecSync change cycle are green (Leif/CoS standing order) |
| Box update | `scripts/corvidinho-update.sh` + `docs/BOX-UPDATE.md` / `docs/UPDATE.md` — pidfile ready-wait + rollback; no Discord panic spam |
| Releases | Tag `v*` → `.github/workflows/release.yml` creates GitHub Release with verbose notes |

## Not inventing

ACCESS, bounty, MainNet product surfaces. No on-chain identity in v1. Do not invent HI/AC.

**HI confirmed + captured (2026-09-26):** Leif approved MEMORY/IDENTITY/ADMIN/AUTONOMY/SESSION + PROCESS. Live acceptance criteria are under `hi/` (`memory.md`, `identity.md`, `admin.md`, `autonomy.md`, `session.md`). `docs/hi-drafts/` is historical — do not treat as pending.

**HI confirmed + captured (2026-09-26, schedule/worktree/memory-ACL):** Leif confirmed DISCORD-SCHEDULE-1..5, SESSION-WORKTREE-1..5, MEMORY-ACL-1..5 with amendment **self-forget also requires ADMIN**. Live in `hi/discord.md`, `hi/session.md`, `hi/memory.md` (+ `hi/admin.md` cross-link). Impl: #57 · #58 · #59 — no code in the HI-capture PR.

**HI confirmed + captured (2026-09-26, DISCORD-ANNOUNCE):** Leif confirmed DISCORD-ANNOUNCE-1..6. Live in `hi/discord.md`. Impl: `/announce` channel|show + persist + bridge-live post to announce-only channel — this PR (package **0.0.8**; MEMORY inject already shipped as **0.0.7** on main).


**HI confirmed + captured (2026-09-26, ROLES-CHAT):** Leif confirmed ROLES-CHAT-1..7 (community chat vs ADMIN tool gates; two-tier interim until #65). Live in `hi/roles.md` (+ identity/safe/admin cross-links). Gate impl + tests follow in a separate PR before #43 ADMIN slash.


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
| WATCH reliability (auto-ack + poll log + summary/spawn/backoff) | — | REQ-watch-007 + **WATCH-RELIABILITY-1..3** (`hi/watch.md`): per-cycle counters; auto-ack; **post-run summary** once/event after successful ack; **spawn outcome** JSONL + structured log; **403 rate-limit backoff** (Retry-After/reset, default 60s); ignore own mentions; pagination bury docs |
| GitHub writes + assignee ingress | #48 → [#52](https://github.com/CorvidLabs/Corvidinho/pull/52) | Dangerous Octokit writes: issue create/comment, PR create (attribution footer), PR review; SAFE-1 + GITHUB-6 gates; WATCH `assignment` events from assignees; fixtures/dry-run; no live tokens in CI |
| Discord spawn + dogfood path | → [#32](https://github.com/CorvidLabs/Corvidinho/pull/32) | Always `bun`-invoke `.ts` for protocol + agent spawn (fix EACCES); parse `task run --json` for Discord summary; thin env-gated LLM execute stub |
| LLM tool loop (DOGFOOD) | #31 → [#33](https://github.com/CorvidLabs/Corvidinho/pull/33) | Interruptible OpenAI-compatible plugin tool loop on `task run` (AGENT-3/5); prove-before-done unchanged; fixture mock HTTP; Discord/WATCH keep `--no-verify` |
| v0.0.2 dogfood polish | → [#34](https://github.com/CorvidLabs/Corvidinho/pull/34) | Shared `src/version.ts` from package.json; enriched ephemeral `/status` (LLM model+host / demo stub, slash names, optional git tip); no new slash commands |
| HI drafts folder | #41–#44 → [#47](https://github.com/CorvidLabs/Corvidinho/pull/47) | `docs/hi-drafts/` proposals (superseded by capture) |
| Tag→Release + box updater | → [#45](https://github.com/CorvidLabs/Corvidinho/pull/45) | release Action + `corvidinho-update.sh` |
| HI capture (confirmed) | #41–#44 + #37 SESSION + PROCESS → main | Real `hi/` MEMORY/IDENTITY/ADMIN/AUTONOMY/SESSION + PROCESS in AGENTS/STATUS |
| DISCORD-SCHEDULE slash | #57 → (this PR) | `/schedule` single-project recurring runs (DISCORD-SCHEDULE-1..5); 5m min; ADMIN mutations; cooperative ticker; SESSION durable store from #61 remains bridge path |
| MEMORY SQLite + ACL | #41 + #59 → [#64](https://github.com/CorvidLabs/Corvidinho/pull/64) | Shared DB schema v3 `memories`; per-user Discord ACL; ADMIN-only forget/override incl. self-forget; empty admin deny-all; memory-* plugins; no `/memory` slash; package **0.0.4** |
| MEMORY ACL hardening | #59 follow-up → [#128](https://github.com/CorvidLabs/Corvidinho/pull/128) | Memory plugins take actor/ADMIN only from bridge env (argv `--user`/`--admin`/`--db` refused); handler-time ADMIN re-check (empty = deny-all); two-phase HMAC confirm for forget/override from a new turn (SAFE-4); `--include-deleted` ADMIN-only; Discord/WATCH spawn env hygiene; no schema change |
| SAFE-6 secret scrub | #66 → [#130](https://github.com/CorvidLabs/Corvidinho/pull/130) | Scrub vendor-key shapes on every SQLite write; automatic re-scrub when `SCRUB_RULES_VERSION` rises; SAFE-10 / mnemonics await HI |
| Spawn `.env` isolation | → [#133](https://github.com/CorvidLabs/Corvidinho/pull/133) | `bun --no-env-file` for spawned agents (ALLOW-4 / SAFE-1); tests stop creating real `talk/*` worktrees |
| `/work` restart recovery | #87 → [#135](https://github.com/CorvidLabs/Corvidinho/pull/135) | Abandoned queued/running work failed honestly on start; talk ended (SESSION-WORKTREE-3); queue/locks draft AUTONOMOUS-14 |
| HI: retire human CLI | #129 → [#134](https://github.com/CorvidLabs/Corvidinho/pull/134) | CLI-1/2/6/9 retired; CLI-7/8 kept for the daemon; package **0.0.9** release cut |
| SESSION-WORKTREE isolation | #58 → (this PR) | Per-talk/project git worktree isolation (SESSION-WORKTREE-1..5); `src/worktree/`; schema v4 session columns; schedule ticks use project scope; package **0.0.5**; Discord bridge restart needed to pick up |
| v0.0.3 updater polish | → main | Pidfile stop/start + ready-wait; `docs/UPDATE.md`; release idempotency; builds on [#45](https://github.com/CorvidLabs/Corvidinho/pull/45) |
| Discord presence version | → [#53](https://github.com/CorvidLabs/Corvidinho/pull/53) | DISCORD-12: Custom Status under bot name shows shared `vX.Y.Z` from `src/version.ts` on ClientReady/restart; fixture test; no slash/allowlist churn |
| Live NDJSON event stream | #73 → [#139](https://github.com/CorvidLabs/Corvidinho/pull/139) | `task run --output ndjson`; Discord/WATCH live state/tool/tokens (AGENT-8 / CLI-7 / DISCORD-3); protocol **2** (DISCORD-10); in the **v0.0.10** build |
| IDENTITY owner + owner-only ADMIN | #42 → [#138](https://github.com/CorvidLabs/Corvidinho/pull/138), [#141](https://github.com/CorvidLabs/Corvidinho/pull/141) | Durable owner (IDENTITY-1); ADMIN = owner only, no owner ⇒ nobody (IDENTITY-2/3); admin env lists ignored + warned; in the **v0.0.9** build |
| SAFE-5 audit trail | #95 → [#136](https://github.com/CorvidLabs/Corvidinho/pull/136) | HMAC-chained append-only `audit_log` (schema v5) for dangerous plugin runs; SAFE-17 awaits HI; in the **v0.0.9** build |
| `--task` argv hardening | → [#143](https://github.com/CorvidLabs/Corvidinho/pull/143) | Untrusted bridge text after `--task` never becomes CLI flags (AGENT-5 / SAFE-1); in the **v0.0.10** build |
| Typed git tools | #82 → [#145](https://github.com/CorvidLabs/Corvidinho/pull/145) | status/diff/log + dangerous branch-create/commit/push; SAFE-1/2/3, GITHUB-6 push gate; hooks off; package **0.0.12** |
| Always verify bridges (#85 slice) | #85 → (this PR) | Discord/WATCH spawn without `--no-verify` (AGENT-4 / FLEDGE-2); empty `filesChanged` still skips lane; CLI flag local-only; package **0.0.13**; draft AGENT-14/15 deferred |
| Durable WATCH sessions | #37 → [#142](https://github.com/CorvidLabs/Corvidinho/pull/142) | Schema v6 `watch_sessions`, soft TTL, restart-safe; clean shutdown + single-flight polls; package **0.0.12** |
| `corvidinho daemon` | #108 → [#157](https://github.com/CorvidLabs/Corvidinho/pull/157) | Headless schedule ticker (CLI-8 / AUTONOMOUS-4); OPS-3..5 drafts wait; package **0.0.16** |
| SSRF-guarded web-fetch | #111 → [#148](https://github.com/CorvidLabs/Corvidinho/pull/148) | SAFE-7 fetch side; dangerous; web-search not captured; package **0.0.16** |
| Fledge plugins as tools | #112 → [#154](https://github.com/CorvidLabs/Corvidinho/pull/154) | FLEDGE-4/5, PLUGIN-3/6; package **0.0.16** |
| GitHub PR diff/files + CI by ref | #93/#94 → [#153](https://github.com/CorvidLabs/Corvidinho/pull/153), [#158](https://github.com/CorvidLabs/Corvidinho/pull/158) | GITHUB-3/4 read halves; GITHUB-10/11 drafts wait; linear SAFE-6 scrub; package **0.0.16** |
| Project instructions in prompt | #84 → [#150](https://github.com/CorvidLabs/Corvidinho/pull/150) | AGENT-1; AGENT-13 skills draft waits; package **0.0.16** |
| `/work` → draft PR | #88 → [#166](https://github.com/CorvidLabs/Corvidinho/pull/166) | AUTONOMOUS-3 / GITHUB-2/5 / AGENT-4; owner-only (ROLES-CHAT-3); in the **v0.0.17** build |
| Instructions from HEAD | #84 → [#169](https://github.com/CorvidLabs/Corvidinho/pull/169) | AGENT-1 hardening; in the **v0.0.17** build |
| Ask-human + owner ping | #44 → [#163](https://github.com/CorvidLabs/Corvidinho/pull/163) | AUTONOMY-1..3 / AUTONOMOUS-7; schema v7; package **0.0.18** |
| Autonomous gate + delegate | #117 → [#167](https://github.com/CorvidLabs/Corvidinho/pull/167) | AUTONOMOUS-1/5, SAFE-9; package **0.0.18** |
| Bug sweep + councils (0.0.21) | #175–#186 | Actor allowlist/deny gating, /work project clamp, schedule worktree isolation + safe branch cleanup, TTL never parks a live run, pinned Bun config, attachments in root, symlink clamp, `--` argv kept; council tool (#118); /admin + pr-diff edges; operator guide; package **0.0.21** |
| Discord deny polish | → (this PR) | DISCORD-DENY-1..3: MessageCreate silent outside allowlist; slash admin ephemeral tip / non-admin zero-width ack; [`docs/discord.md`](docs/discord.md) slash+outbound+deny mermaid |

| Files/search plugins + SAFE-2 | #81 → [#127](https://github.com/CorvidLabs/Corvidinho/pull/127) | `files-read/write/edit/glob/list/delete` + `search-grep`; path clamp; SAFE-2 protected infra refuse; package **0.0.6**; Discord restart for presence only |
| Shell plugin + SAFE-3 cwd clamp | #83 → [#140](https://github.com/CorvidLabs/Corvidinho/pull/140) | Typed `shell-exec` dangerous/code; spawn cwd pin + lexical cd/pushd refuse (SAFE-3); SAFE-1 allowlist; package **0.0.9** |
| DISCORD-ANNOUNCE slash | → (this PR) | `/announce` channel|show (CHANNEL picker); persist announce channel id on shared SQLite; bridge-live posts **only** to announce channel (not dogfood allowlist); ADMIN mutations; package **0.0.8**; Discord restart + slash re-register |
| Runtime `/admin` allowlist | #43 → [#147](https://github.com/CorvidLabs/Corvidinho/pull/147) | Owner-only `/admin users|channels|config` (ADMIN-1..4); CHANNEL picker; atomic allowlist.toml writes; package **0.0.15**; re-register slash |
| MEMORY Discord auto-recall inject | draft #67 behavior under AGENT-7/MEMORY-2/4 → (this PR) | Spawn prepends recalled memories; system prompt store/recall rules; richer tool argv; package **0.0.7**; Discord restart + channel update |

### In flight / next

| Order | Issue | Notes |
|-------|-------|--------|
| Done | [#81](https://github.com/CorvidLabs/Corvidinho/issues/81) PLUGIN files/search + SAFE-2 | Shipped [#127](https://github.com/CorvidLabs/Corvidinho/pull/127) — package **0.0.6** |
| **Done (cut-order)** | MEMORY Discord inject (AGENT-7 / MEMORY-2/4; draft #67) | Shipped this PR — auto-recall prepend + system prompt + tool argv; package **0.0.7** |
| Done | [#83](https://github.com/CorvidLabs/Corvidinho/issues/83) shell-exec + SAFE-3 | Shipped [#140](https://github.com/CorvidLabs/Corvidinho/pull/140) — package **0.0.9** |
| **P0 next** | M3 remaining plugins (git, …) | Next after #83; still HI-gated — do not invent criteria |
| Done | Slash guild PUT=6 + global `[]` | Landed [#51](https://github.com/CorvidLabs/Corvidinho/pull/51) |
| Done | Discord deny polish (DENY-1..3) + `docs/discord.md` | Landed prior |
| Done | [#58](https://github.com/CorvidLabs/Corvidinho/issues/58) SESSION-WORKTREE | Shipped (worktree manager + Discord/schedule wire + schema v4); package **0.0.5** |
| Ops | [#19](https://github.com/CorvidLabs/Corvidinho/issues/19) GH go-live + [#48](https://github.com/CorvidLabs/Corvidinho/issues/48) writes | Token + username + allowlists + `github watch`; write plugins in [#52](https://github.com/CorvidLabs/Corvidinho/pull/52) — need `CORVIDINHO_ALLOWLIST` for ACT |
| Done | [#41](https://github.com/CorvidLabs/Corvidinho/issues/41) MEMORY + [#59](https://github.com/CorvidLabs/Corvidinho/issues/59) MEMORY-ACL | Shipped [#64](https://github.com/CorvidLabs/Corvidinho/pull/64) (schema v3 + ACL + plugins; package 0.0.4); ACL hardening [#128](https://github.com/CorvidLabs/Corvidinho/pull/128) (0.0.9) |
| Done | [#42](https://github.com/CorvidLabs/Corvidinho/issues/42) IDENTITY-1..3 | Owner record [#138](https://github.com/CorvidLabs/Corvidinho/pull/138) + owner-only ADMIN [#141](https://github.com/CorvidLabs/Corvidinho/pull/141); owner extras (#36/#96/#44) await HI |
| Done | [#73](https://github.com/CorvidLabs/Corvidinho/issues/73) NDJSON stream | [#139](https://github.com/CorvidLabs/Corvidinho/pull/139) |
| Done (slice) | [#85](https://github.com/CorvidLabs/Corvidinho/issues/85) always-verify bridges | Discord/WATCH drop `--no-verify` (this PR / **0.0.13**); draft AGENT-14/15 still open |
| Done | [#43](https://github.com/CorvidLabs/Corvidinho/issues/43) ADMIN-1..4 → [#147](https://github.com/CorvidLabs/Corvidinho/pull/147) / **v0.0.15** |
| In flight | [#44](https://github.com/CorvidLabs/Corvidinho/issues/44) AUTONOMY-1..3, [#93](https://github.com/CorvidLabs/Corvidinho/issues/93)/[#94](https://github.com/CorvidLabs/Corvidinho/issues/94) GitHub reads, [#111](https://github.com/CorvidLabs/Corvidinho/issues/111) web-fetch, [#112](https://github.com/CorvidLabs/Corvidinho/issues/112) Fledge plugins, [#108](https://github.com/CorvidLabs/Corvidinho/issues/108) daemon, [#117](https://github.com/CorvidLabs/Corvidinho/issues/117) delegate, [#88](https://github.com/CorvidLabs/Corvidinho/issues/88) issue→PR | Captured-HI slices only; drafts wait for Leif |
| Go-live | [#5](https://github.com/CorvidLabs/Corvidinho/issues/5) HEAR **live** | Token + channel allowlists on VM |
| Defer | [#9](https://github.com/CorvidLabs/Corvidinho/issues/9) iced/billing/Windows; WALLET ACT | Explicit do-not-steal-now |

### Leif config moments

**PREPARE NOW (no secrets required in repo):**

- Draft `~/.config/corvidinho/allowlist.toml` (copy shape from **Allowlists** below) for GH orgs/repos/users and Discord channels/roles/users — write the file **empty/deny-all** today; fill lists when ready
- Decide Discord channel IDs + admin/user IDs + GH allowlists offline

**GO-LIVE for Discord HEAR (#5 thin shipped):**

- `DISCORD_TOKEN` or `DISCORD_BOT_TOKEN` in VM env/secret store (never commit)
- Non-empty Discord channel allowlist: `DISCORD_CHANNEL_IDS` and/or `CORVIDINHO_DISCORD_ALLOW_CHANNELS` / `~/.config/corvidinho/allowlist.toml` `[discord].channels` — empty = refuse start (not Merlin BASIC)
- Optional user/role allowlists (empty = deny-all when those gates apply)
- Then: `corvidinho discord bridge` (or `CORVIDINHO_DISCORD_DRY_RUN=1` for local dry-run)

**GitHub secrets useful when:**

- `GITHUB_TOKEN` / `GH_TOKEN` — useful **NOW** for typed read plugins **and** WATCH poll (`corvidinho github watch`)
- `CORVIDINHO_WATCH_USERNAME` — GitHub login to listen for (WATCH go-live)
- Non-empty `CORVIDINHO_GITHUB_ALLOW_REPOS` / `_ORGS` / `_USERS` (or allowlist file)
- Webhook secret + public URL — **follow-up** when deploying webhook ingress (poll-first is the VM default; see `docs/WATCH.md`)

### Discord @bot + reply → session

Thin slice **landed** (`corvidinho discord bridge`). Live @bot works **only after** the VM has token + non-empty Discord allowlists (see go-live below).

### GitHub mention / assign → agent response → comment → PR

**Poll thin slice landed** (`corvidinho github watch`) — [#19](https://github.com/CorvidLabs/Corvidinho/issues/19). **Assignee ingress + write plugins** — [#48](https://github.com/CorvidLabs/Corvidinho/issues/48): `assignment` events when watch user is assignee; dangerous `github-issue-create` / `github-issue-comment` / `github-pr-create` / `github-pr-review` (SAFE-1 allowlist + GITHUB-6). Live listen needs token + username + non-empty GH allowlists + `CORVIDINHO_ALLOWLIST` for writes. No reply to random mentions (ALLOW-1). Webhook deferred (poll-first for VM; see `docs/WATCH.md`).

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

- Full LLM tool loop on top of prove-before-done — **shipped** [#31](https://github.com/CorvidLabs/Corvidinho/issues/31) (thin MVP: env-gated OpenAI tools → plugins; read/tool/code tier; SAFE-1 deny unchanged). Remaining gaps: no session resume (AGENT-6), no durable memory (AGENT-7), no streaming deltas, no mid-run tier escalation, file plugins still thin (filesChanged only when a tool reports them)
- SpecSync agent tools (#8→#22) so the live CLI can list/read/check specs — **shipped**
- For Discord callers: HEAR (#5) **live on Leif's box** (token + allowlists); bun-spawn for `.ts` fixed this PR
- For GH @mention callers: WATCH poll (#19) shipped — still needs VM token + username + allowlists; webhook optional later
- Attribution (#20→#24) on outbound PRs — **shipped**
- Package **0.0.3** — updater pidfile/ready + release idempotency + `docs/UPDATE.md`
- Package **0.0.2** + richer Discord `/status` (shared version, LLM mode without key, slash names, optional git tip) — [#34](https://github.com/CorvidLabs/Corvidinho/pull/34)
- Secrets stay in env/secret store; default-deny allowlists stay empty=refuse

### Phased milestones

1. **Foundation** — done (#1, #2, #15, #18)
2. **Prove loop** — done (#17)
3. **SpecSync wiring** — #8 → #22 (landing; CLI usefulness for live callers)
4. **Discord HEAR** — #5 → #23 thin shipped (go-live = token + allowlists on VM)
5. **Attribution** — #20 → #24 shipped
6. **DOGFOOD / RUNNER** — first flip: CoS/Corvidinho-bot execs headless CLI (#8/#5 help; not a UI milestone)
7. **Discord polish** — #10→#25 thinking; #11→#26 slash; #12→#27 rate/mute; #13→#28 admin; #14→#29 image+protocol
8. **GH mention ingress** — #19 WATCH poll shipped (webhook follow-up); later GITHUB-2/3/5 writes
9. **Deferred** — #9, wallets

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
roles = ["admin"]
users = []
```

   Or JSON with the same shape. Override path with `CORVIDINHO_ALLOWLIST_FILE`.

2. Optional env overlays (union onto file when non-empty):
   - `CORVIDINHO_GITHUB_ALLOW_REPOS` / `_ORGS` / `_USERS`
   - `CORVIDINHO_GITHUB_DENY_REPOS` / `_ORGS` / `_USERS`
   - `CORVIDINHO_DISCORD_ALLOW_CHANNELS` / `_ROLES` / `_USERS`
   - `CORVIDINHO_DISCORD_DENY_*`

Secrets (`DISCORD_TOKEN`, `GITHUB_TOKEN`, …) stay in env/secret store — never in the allowlist file committed to git.

### AlgoChat / wallets — deferred

WALLET-1..3 captured in `hi/allow.md`. **No wallet ACT** until an approved-wallet allowlist exists. HEAR (#5) must wire Discord channel/user allowlist checks before go-live.



## READY-FOR-SECRETS (Discord HEAR)

**Milestone:** bridge code accepts token + non-empty allowlists end-to-end; docs/templates shipped; doctor/bridge fail cleanly without secrets.

| Gate | State |
|------|--------|
| `corvidinho discord bridge` thin slice | **Shipped** (this PR / #5) |
| `.env.example` + `allowlist.example.toml` | **Shipped** (no secret values) |
| `docs/DISCORD-GO-LIVE.md` (Developer Portal + VM paths) | **Shipped** |
| `docs/discord.md` (slash / outbound / deny UX; mermaid docs-only) | **This PR** |
| Doctor: missing token / empty channels | **Shipped** (clear exit / refuse start) |
| Live token in VM | **Done on Leif's box** (corvid-agent#1110) — keep secrets in secret store only |
| Non-empty channel IDs on VM | **Done on Leif's box** — keep allowlists default-deny elsewhere |

**Ping CoS/Leif for secrets ONLY when this milestone is green in code** (merge + doctor checklist ready). Do not ask for tokens before READY-FOR-SECRETS.

## Discord HEAR go-live checklist

Code for #5 is in-tree. Live Discord still needs secrets on the bot VM:

1. `export DISCORD_TOKEN=…` or `DISCORD_BOT_TOKEN=…` (secret store; never commit)
2. Non-empty channels: `DISCORD_CHANNEL_IDS=…` **or** allowlist file / `CORVIDINHO_DISCORD_ALLOW_CHANNELS`
3. Optional: `CORVIDINHO_DISCORD_ALLOW_USERS` / `_ROLES` (empty = deny-all for those checks)
4. `corvidinho doctor` — Discord check should go green
5. `corvidinho discord bridge`

Fixture/unit tests cover mention→session, reply/thread continuity, and allowlist refuse without a live token. Do not block merge on missing token.

## Next

See **ROADMAP** above. Short pointers:

- #5 HEAR **live on Leif's box** (corvid-agent#1110); bun-spawn `.ts` fix + JSON summary this PR
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
