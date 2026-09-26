# Corvidinho feature-steal inventory (draft)

**Status:** draft only — no code, no `hi capture`, no push to CorvidLabs/Corvidinho (empty repo as of 2026-09-26 MT).
**Target:** Linux-first agent runner that plans to **support Fledge + SpecSync as products**, stealing durable wants from archived corvid-agent, Merlin, and Discord patterns from corvid-bot.
**Not inventing:** ACCESS, bounty, MainNet product surfaces.

## Sources inspected

| Source | What was read | Key paths |
|--------|---------------|-----------|
| **CorvidLabs/corvid-agent** (archived, Bun/TS) | README, VISION, `fledge.toml`, skills/, server/*, cli/commands/ | `server/discord/`, `server/process/`, `server/mcp/`, `server/plugins/`, `server/github/`, `server/work/`, `server/db/`, `cli/` |
| **CorvidLabs/merlin** (Rust + Fledge) | README, autonomous.md, bridges/discord.md, plugins/internal.md, `fledge.toml`, crates/, plugins/ | `crates/merlin-cli`, `crates/merlin-core`, `plugins/fledge-plugin-*`, `bridges/discord/`, `specs/` |
| **CorvidLabs/corvid-bot** (Swift) | INTENT, hi/*, Bot.swift, CommandAuth, RateLimiter, Commands/ | Discord patterns only — not VERIFY/ROLE/SPEND product |
| **Fledge** (local `/workspace/fledge`) | README, hi/*, lanes/tasks/plugins consumer surface | `fledge.toml` tasks+lanes, `fledge plugins`, `fledge spec check`, `fledge lanes run` |
| **SpecSync** (local `/workspace/spec-sync`) | README, SCOPE | `specsync check/coverage/generate/change`, `.specsync/`, companion files |
| **CorvidLabs/Corvidinho** | empty repo created 2026-09-26 | n/a |

---

## A) STEAL / PORT (want in Corvidinho)

Human capabilities to bring over. Paths are provenance, not a porting order.

### AGENT — loop, sessions, providers, verification gate

| Want | Provenance |
|------|------------|
| Spec-aware plan → tool loop → verify-before-done | Merlin `docs/book/src/architecture/agent-loop.md`; `verify_before_complete` in `fledge.toml` `[merlin]`; corvid-agent `server/process/` lifecycle |
| Multi-provider with tier (read/tool/code) and cheap default | Merlin providers + `--tier`; corvid-agent `server/providers/`, Claude SDK + Ollama |
| Session resume / continuity | Merlin `--resume`; corvid-agent `cli/commands/session.ts`, `server/process/session-*` |
| Memory that survives turns (local SQL, not on-chain first) | Merlin `fledge-plugin-memory-merlin`; corvid-agent `server/memory/` + skills/memory (SQLite tier only for v1) |
| Streaming events for bridges/CLI | Merlin `AgentEvent`; corvid-agent WebSocket/event-bus |
| Cancellation that actually stops | Merlin cancellation token; corvid-agent session exit handlers |

### DISCORD — bridge as first-class chat surface

| Want | Provenance |
|------|------------|
| Bidirectional Discord bridge (gateway, mention → session, reply → resume) | Merlin `bridges/discord/`; corvid-agent `server/discord/` (`bridge.ts`, `message-handler.ts`, `thread-*`) |
| Slash commands for session/status/agents/work (agent ops, not token product) | Merlin bridge commands table; corvid-agent `server/discord/commands.ts`, `admin-commands.ts` |
| Live “thinking” embeds (elapsed, tool, tokens) | Merlin discord.md; corvid-agent `embed-builder.ts` / `embeds.ts` |
| Channel allowlist + rate limit + per-user mute | Merlin bridge config + `rate-limiter.ts` + permissions; corvid-bot `RateLimiter.swift` pattern |
| Re-check admin at handler time (never trust registration alone) | corvid-bot `Commands/CommandAuth.swift` |
| Image attachments → vision path | Merlin `images.ts` + vision plugin; corvid-agent `image-attachments.ts` |
| Confused-deputy guard on cross-channel post (requester perms) | Merlin discord.md API auth section |
| Protocol-version lockstep between bridge and agent binary | Merlin `protocol-version.ts` |

### GITHUB — real repo citizen

| Want | Provenance |
|------|------------|
| Issues / PRs / reviews / CI status via typed tools (not raw shell `gh`) | Merlin `fledge-plugin-github`; corvid-agent skills/github + `server/github/` |
| Worktree → implement → validate → optional PR | Merlin work-tasks; corvid-agent `skills/work-tasks`, `server/work/` |
| Repo blocklist / refuse foot-gun targets | corvid-agent github skill notes |
| Status embeds / notifications back to Discord when useful | Both bridges’ work-dispatch patterns |

### FLEDGE — first-class consumer + author surface

| Want | Provenance |
|------|------------|
| Project rooted on `fledge.toml` tasks + lanes (`verify`, `check`, …) | corvid-agent + Merlin `fledge.toml`; Fledge product |
| Agent runs `fledge lanes run verify` as the done-gate | Merlin agent-loop Verifying state |
| Plugin runtime: discover, invoke, schema-budget awareness | Merlin plugins + `merlin doctor --context-budget`; Fledge plugin protocol |
| Author/run project plugins the same way Merlin does | Merlin `docs/book/src/plugins/authoring.md`; `plugin.toml` |
| Spec check as a fledge task (`spec-check` / `fledge spec check`) | Both repos’ verify lanes |
| Linux install path first (`cargo install` / release binary / brew later) | Fledge README platforms |

### SPECSYNC — first-class consumer

| Want | Provenance |
|------|------------|
| Read/list/check specs before coding (`specsync-check/list/read` tools) | Merlin `fledge-plugin-specsync` |
| Live under `.specsync/` + `specs/` like sibling CorvidLabs repos | corvid-agent `.specsync/`; Merlin `.specsync/` + 71 module specs |
| Change workflow awareness (adopt/verify) without owning SpecSync | SpecSync `change` lifecycle; Merlin archive under `.specsync/archive/` |
| CI-shaped: `--strict` / coverage as lane step | SpecSync SCOPE; both verify lanes |
| Companion files (`context.md`, `tasks.md`) as agent briefing | SpecSync SCOPE |

### CLI — operator surface (Linux)

| Want | Provenance |
|------|------------|
| One binary: REPL + one-shot prompt + `--non-interactive` | Merlin CLI; corvid-agent `cli/index.ts` + interactive |
| `init` / `doctor` / `setup` that fail loud on missing keys/tools | Merlin `doctor`, `setup`; corvid-agent `cli/commands/doctor.ts`, `init.ts` |
| `--daemon` tick loop for schedules/councils/delegation | Merlin `--daemon` + autonomous.md |
| Keys in OS/credential store; spend/metrics/audit subcommands | Merlin `keys`, `spend`, `metrics`, `audit` |
| `diagnostics` / redacted support bundle | Merlin `diagnostics` |
| JSON/ndjson output for bridges | Merlin `--output` |

### PLUGIN — extension model

| Want | Provenance |
|------|------------|
| Capabilities as plugins with `dangerous` / `min_tier` markings | Merlin 44 plugins + reviewed markings |
| Core set: files, search, shell (cwd-clamped), git, github, web (SSRF-safe), memory, specsync, fledge | Merlin internal plugins list |
| Language runners as plugins (cargo, node, python, …) not hardcoded | Merlin cargo/node/python/swift/gradle plugins |
| Autonomous suite as optional plugins behind config flag | Merlin autonomous suite plugins |
| CLI to list/install/enable plugins | corvid-agent `cli/commands/plugin.ts`; Fledge `fledge plugins` |

### SAFE — gates that do not depend on model manners

| Want | Provenance |
|------|------------|
| Dangerous tools need consent; auto-deny under `--non-interactive` unless allowlisted | Merlin security README |
| Protected paths hard-refuse (`.env`, `fledge.toml`, specs, `.git`, keystores) | Merlin `files-delete` infra block; corvid-agent `protected-paths.ts` |
| Shell cwd clamp to project root | Merlin shell plugin |
| Destructive SQL / memory-delete two-phase confirm | Merlin sqlrun + memory-merlin |
| Tamper-evident destructive-op audit log | Merlin `merlin audit` / HMAC chain |
| Secret redaction before persist; `redact-history` | Merlin |
| SSRF guard on web-fetch/search | Merlin |
| Spend caps refuse over-budget calls | Merlin credits / spend |
| Expensive networking tools opt-in (hide from small/untrusted sessions) | corvid-agent `tool-guardrails.ts` |
| Admin Discord commands re-authorized in handler | corvid-bot CommandAuth |

### AUTONOMOUS — optional multi-agent layer

| Want | Provenance |
|------|------------|
| Named personas with skills tags | Merlin `[merlin.autonomous.agents.*]`; corvid-agent councils/orchestration |
| Work tasks in git worktrees | Both work-tasks |
| Cron scheduling + daemon tick | Merlin scheduling + daemon; corvid-agent `server/scheduler/` |
| Delegation + councils (structured multi-agent) | Merlin delegation/councils; corvid-agent `server/councils/` |
| Owner comms escalate to Discord DM | Merlin owner-comms |
| Credits / daily budget visibility | Merlin credits; corvid-agent billing (metering idea only) |
| HTTP/WS agent-team API for bridges | Merlin `--serve` / agent-team; corvid-agent REST+WS |

### SpecSync + Fledge integration points already proven (must plan to support)

| Integration | Where used today |
|-------------|------------------|
| `fledge.toml` `[tasks]` + `[lanes.verify]` including `spec-check` | corvid-agent, Merlin |
| `fledge lanes run verify` as agent completion gate | Merlin agent loop |
| `fledge plugins` / in-tree `fledge-plugin-*` with `plugin.toml` | Merlin |
| `fledge spec check` / project `spec-check` task | Both |
| `.specsync/config.toml` + registry + `specs/**` | Both |
| SpecSync change archive under `.specsync/archive/changes/` | Merlin |
| Claude/Cursor/Codex skills for SpecSync | Merlin `.claude/skills/spec-sync` |
| Bridge verify lanes (`bridge-verify`) separate from Rust verify | Merlin |

---

## B) DEFER / SKIP

| Item | Why |
|------|-----|
| **Merlin iced desktop (`merlin-desktop`) as primary** | Corvidinho is Linux-first CLI/daemon/bridges; GUI is Merlin’s product surface |
| **Windows as a supported platform** | Explicit Linux-first; Merlin’s own 0.9 still tracking Windows |
| **corvid-bot token verification product** (VERIFY/ROLE/GIFT/RAIN/PLAY/…) | Separate product; steal Discord *engineering* patterns only |
| **Heavy Rust-from-scratch compile path as the only ship story** | Prefer fast Linux binary install; do not require every operator to rebuild the world (Merlin’s internal cargo path stays optional for contributors) |
| **Angular dashboard / corvid-agent `client/`** | Heavy web UI; agent-team HTTP + Discord first |
| **Telegram bridge (v1)** | Steal later; Discord first |
| **AlgoChat / on-chain identity / ARC-69 memory / flock directory as v1** | Preview in Merlin; full stack in archived corvid-agent — defer until after Fledge/SpecSync/Discord loop is solid. **Do not invent MainNet.** |
| **ACCESS / bounty / MainNet product criteria** | Explicitly out of invent scope for this HI |
| **Merlin accounts + E2E sync + Paddle billing** | Merlin 0.8/1.0 monetization — not Corvidinho’s job |
| **Quill local STT / voice as primary** | Nice later; cloud STT optional later |
| **Snapshots gallery / iced UI harness** | Desktop-only |
| **corvid-agent marketplace, billing activation, A2A full maturity** | Ecosystem later |
| **Slack bridge** | VISION mentions it; not needed for Linux Discord-first agent |
| **SwiftPM-in-agent as default** | Optional plugin later; Linux agent defaults to shell/node/python/cargo |
| **Re-implementing SpecSync or Fledge inside Corvidinho** | Support as products/CLIs, do not fork them |

---

## Draft HI (HI/1) — for Leif to confirm

Proposed `hi/` files below. Human want sentences. Families match the requested set.
No capture run. Adjust wording/ids before anything is written into CorvidLabs/Corvidinho.
