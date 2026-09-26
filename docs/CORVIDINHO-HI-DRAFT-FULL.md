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

----------------------------------------------------------------
## Proposed hi/ file bodies
----------------------------------------------------------------

### hi/agent.md

```markdown
---
hi: 1
families: [AGENT]
owner: leif
---

# Agent

## Intent

Corvidinho is the agent I actually run on a Linux box: it reads the project’s rules, does the work with tools, and only claims done when the verify lane says so. It should feel like a careful junior with a checklist, not a chat window that forgets what “finished” means.

## Criteria

- **AGENT-1**  I can give Corvidinho a task in a project folder and it works from that project’s own config and tools, not from some global sandbox of its own.
- **AGENT-2**  Before it writes code, it loads the relevant specs so the work is constrained by what we already agreed, not by vibes.
- **AGENT-3**  It runs a tool loop I can interrupt, and when I interrupt it, it actually stops instead of finishing in the background.
- **AGENT-4**  It does not tell me the job is done until the project’s verify lane has passed, or it tells me plainly that verification failed.
  - **AGENT-4.a**  If verification fails and retries remain, it keeps working with the failure output instead of shrugging.
- **AGENT-5**  I can pick a provider and a capability tier so cheap models stay on read-shaped work and expensive ones are used when tools and code are required.
- **AGENT-6**  I can leave a session and come back to it later without losing the thread.
- **AGENT-7**  It remembers the small durable facts I asked it to keep for this project, without needing a blockchain to do so.
- **AGENT-8**  While it works I can see what state it is in — planning, calling a tool, verifying, or done — so bridges and the CLI are not guessing.
```

### hi/discord.md

```markdown
---
hi: 1
families: [DISCORD]
owner: leif
---

# Discord

## Intent

Discord is how I talk to the agent while I am not in a terminal. Mentions become sessions, replies continue them, and slash commands cover the boring ops. It is a bridge into Corvidinho, not a token-gating product and not a second brain with different rules.

## Criteria

- **DISCORD-1**  I can @ the bot in an allowed channel and it starts a real agent session on my Linux host, not a toy reply bot.
- **DISCORD-2**  If I reply to one of its messages, the same session continues without me hunting for an id.
  - **DISCORD-2.a**  Inside a thread it keeps one session for that thread so the conversation stays coherent.
- **DISCORD-3**  While it thinks I see a live status (time, current tool, rough token use) instead of a silent void.
- **DISCORD-4**  Slash commands let me manage sessions, see agents, check status, and drive work tasks without leaving Discord.
- **DISCORD-5**  It only listens and posts in channels I allowlisted; everything else is refused.
- **DISCORD-6**  Rate limits and mutes stop one user from melting the box, without punishing everyone else.
- **DISCORD-7**  Admin-shaped commands are checked again when they run, even if Discord’s UI later showed them to the wrong people.
- **DISCORD-8**  If the agent tries to post to another channel on my behalf, the bridge checks that *I* could have posted there, not only that the bot could.
- **DISCORD-9**  Images I attach are available to the agent as files it can actually look at.
- **DISCORD-10**  If the bridge and the agent binary disagree on protocol version, the bridge refuses to start rather than misparsing quiet failure.
```

### hi/github.md

```markdown
---
hi: 1
families: [GITHUB]
owner: leif
---

# GitHub

## Intent

The agent should be a normal citizen of the repo: read issues, open PRs, check CI, leave reviews — through typed tools with safety markings, not by shelling out to `gh` and hoping. Humans still merge.

## Criteria

- **GITHUB-1**  I can ask it to list or open issues and pull requests on a repo I care about, and it does that through reviewed tools rather than improvised shell.
- **GITHUB-2**  It can open a pull request from work it did in a worktree, with a description that matches what changed.
- **GITHUB-3**  It can read a PR diff, comment, and submit a review without me pasting the patch into chat.
- **GITHUB-4**  It can tell me whether CI is green or red for a PR or ref.
- **GITHUB-5**  Creating issues and PRs counts as dangerous work: under non-interactive mode it needs an explicit allow, not a silent post.
- **GITHUB-6**  There are repos it simply will not touch, even if prompted, so a bad instruction cannot spray noise across the org.
```

### hi/fledge.md

```markdown
---
hi: 1
families: [FLEDGE]
owner: leif
---

# Fledge

## Intent

Fledge is how Corvidinho projects declare work and prove it. Corvidinho does not replace Fledge; it runs as a careful citizen of `fledge.toml`, lanes, and plugins so the same verify story works for humans and for the agent.

## Criteria

- **FLEDGE-1**  A Corvidinho project can be driven from a `fledge.toml` that names tasks and lanes the same way our other CorvidLabs repos do.
- **FLEDGE-2**  When the agent finishes a change, it runs the project’s verify lane through Fledge instead of inventing its own ad-hoc checklist.
- **FLEDGE-3**  I can run the same verify lane myself from the shell and get the same gate the agent is held to.
- **FLEDGE-4**  Corvidinho can discover and call Fledge plugins that are registered for the project, including ones I author.
- **FLEDGE-5**  Plugin schemas stay small enough that the agent can afford them; I can see when the tool surface is blowing the context budget.
- **FLEDGE-6**  Spec checking is available as a Fledge task on the verify path, not a separate secret ritual.
- **FLEDGE-7**  On Linux I can install and use Corvidinho against Fledge without needing a desktop app or a Windows toolchain.
```

### hi/specsync.md

```markdown
---
hi: 1
families: [SPECSYNC]
owner: leif
---

# SpecSync

## Intent

Specs are the contract. Corvidinho should read them, check them, and refuse to play dumb when they drift — by calling SpecSync, not by reimplementing it. Supporting SpecSync as a product means the agent’s happy path is the same path a careful human already uses.

## Criteria

- **SPECSYNC-1**  In a repo that already has `.specsync/` and `specs/`, Corvidinho can list and read module specs before it edits code.
- **SPECSYNC-2**  It can run SpecSync’s check (including the strictness we use in CI) and treat failures as real blockers for “done.”
- **SPECSYNC-3**  Coverage and score reports are available when I ask, so “are we drifting?” is answered with SpecSync’s numbers, not a guess.
- **SPECSYNC-4**  If the project uses the verified change workflow, the agent can work inside that shape without turning the change machinery off.
- **SPECSYNC-5**  Companion briefing files next to a spec are something it actually reads when starting work on that module.
- **SPECSYNC-6**  Corvidinho never needs SpecSync’s cloud or an API key of SpecSync’s own; local binary + project files are enough.
- **SPECSYNC-7**  Supporting SpecSync means staying compatible with how Fledge wires `spec-check` into lanes, so one green verify means both tools agreed.
```

### hi/cli.md

```markdown
---
hi: 1
families: [CLI]
owner: leif
---

# CLI

## Intent

The Linux CLI is the product surface I trust when Discord is down. One binary should init a project, doctor the environment, run a task, drop into a REPL, or sit as a daemon — without sending me to a GUI.

## Criteria

- **CLI-1**  On Linux I can install a Corvidinho binary and run a one-shot prompt against the current directory.
- **CLI-2**  Bare invoke without a prompt drops me into an interactive REPL that uses the same agent loop as one-shot mode.
- **CLI-3**  `--non-interactive` runs without asking, and dangerous tools are denied unless I allowlisted them.
- **CLI-4**  `init` and `doctor` tell me what is missing (keys, Fledge, SpecSync, project files) in plain language instead of failing later mid-task.
- **CLI-5**  I can point it at another project path without `cd`, and it loads that project’s env and `fledge.toml`.
- **CLI-6**  I can resume a prior session by id or “most recent.”
- **CLI-7**  Output can be human text, a single JSON result, or a stream of events so bridges are first-class clients.
- **CLI-8**  A daemon mode keeps schedules and long autonomous work ticking without me babysitting a REPL.
- **CLI-9**  Keys, spend, audit, and diagnostics are subcommands I can run when something feels wrong, including a redacted support bundle.
```

### hi/plugin.md

```markdown
---
hi: 1
families: [PLUGIN]
owner: leif
---

# Plugin

## Intent

New capabilities should land as plugins with honest danger markings, not as special cases inside the agent core. If Fledge can see the plugin, Corvidinho should be able to use it — and I should be able to write one without forking the agent.

## Criteria

- **PLUGIN-1**  Files, search, shell, git, github, web, memory, SpecSync, and Fledge itself are available as plugins with typed commands.
- **PLUGIN-2**  Every command declares whether it is dangerous and what minimum tier it needs, and the runtime enforces that declaration.
- **PLUGIN-3**  I can add a project or third-party Fledge plugin and have Corvidinho call it without a Corvidinho release.
- **PLUGIN-4**  Language runners I care about on Linux (at least shell plus node/python/cargo when present) show up as plugins that degrade cleanly when the toolchain is missing.
- **PLUGIN-5**  Autonomous extras (work tasks, councils, scheduling, …) are plugins I can leave disabled until I opt in.
- **PLUGIN-6**  I can list what is loaded and see enough schema detail to understand why context got expensive.
```

### hi/safe.md

```markdown
---
hi: 1
families: [SAFE]
owner: leif
---

# Safe

## Intent

Safety has to fire even when the model is having a bad day. Guards live in the tool layer: refuse the foot-gun, log the close call, and never depend on the prompt to save the repo.

## Criteria

- **SAFE-1**  Dangerous tools require my consent; in non-interactive mode they are denied unless I allowlisted them.
- **SAFE-2**  The agent cannot delete or overwrite protected project infra (env files, git metadata, fledge.toml, specs, keystores) through its file tools.
- **SAFE-3**  Shell commands cannot `cd` their way out of the project root to run elsewhere on my machine.
- **SAFE-4**  Destructive data ops (raw SQL wipes, memory deletes) need a two-phase confirm so a single confused tool call cannot erase the store.
- **SAFE-5**  Destructive actions leave a tamper-evident audit trail I can verify later.
- **SAFE-6**  Secrets that look like vendor keys are scrubbed before sessions are saved, and I can re-scrub history when rules tighten.
- **SAFE-7**  Web fetch and search refuse private and link-local targets so the agent is not an SSRF helper.
- **SAFE-8**  When a daily spend cap is set, provider calls that would break it are refused instead of quietly running up the bill.
- **SAFE-9**  Expensive cross-agent networking tools stay hidden until a session is allowed to use them, so small models cannot wander off starting councils unprompted.
```

### hi/autonomous.md

```markdown
---
hi: 1
families: [AUTONOMOUS]
owner: leif
---

# Autonomous

## Intent

Optional multi-agent work should be a config flag away, not the default personality of the binary. When I turn it on, named agents can take worktrees, meet in councils, run on a schedule, and poke me on Discord when they are stuck — still behind the same safety gates.

## Criteria

- **AUTONOMOUS-1**  Autonomous mode is off until I enable it in project config.
- **AUTONOMOUS-2**  I can define named personas with their own provider and skill tags and run as one of them.
- **AUTONOMOUS-3**  A work task gets its own git worktree, does the job, and can open a PR when I allow that path.
- **AUTONOMOUS-4**  I can schedule recurring agent work and have a daemon tick it forward without an open REPL.
- **AUTONOMOUS-5**  A lead agent can delegate subtasks to peers by skill and synthesize the result.
- **AUTONOMOUS-6**  A council can deliberate in structured phases when a decision needs more than one voice.
- **AUTONOMOUS-7**  When autonomous work needs a human, it can reach me through the configured owner channel (Discord) instead of dying quietly.
- **AUTONOMOUS-8**  I can see credit/spend usage for autonomous runs against a budget I set.
- **AUTONOMOUS-9**  Bridges and other clients can talk to the running agent team over a local HTTP/WS API with a token, without that API being required for plain CLI use.
```
