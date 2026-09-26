# Lesson bundle — safe-6-secret-scrub-before-persist-automatic-re-scrub-issue-66-captured-slice-scrub-vendor-key-looking-secrets-github

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: SAFE-6 secret scrub before persist + automatic re-scrub (issue #66 captured slice): scrub vendor-key-looking secrets (GitHub, OpenAI-compatible, Anthropic, Discord bot, Slack, AWS, Google, JWT, bearer, private-key blocks) on every SQLite write path (sessions, work tasks, schedules + runs, memories) and re-scrub existing rows automatically when the scrub rules version increases; no new CLI or slash surface; draft SAFE-10 outbound/Discord-admin re-scrub and Algorand mnemonics left for HI capture
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/store/, src/discord/session-store.ts, src/discord/work-store.ts, src/scheduler/store.ts, src/memory/store.ts, tests/store.scrub.test.ts, specs/discord/
- **Acceptance**: Every SQLite write path (discord_sessions.topic, discord_work_tasks.description/summary, schedules name/description/prompt, schedule_runs summary/error, memories key/content) stores text with vendor-key-looking secrets replaced by [redacted:<kind>] (SAFE-6); patterns cover GitHub (ghp_/gho_/ghu_/ghs_/ghr_/github_pat_), OpenAI-compatible sk-/sk-proj-, Anthropic sk-ant-, Discord bot tokens, Slack xox?-, AWS AKIA/ASIA, Google AIza, JWTs, Bearer tokens and PEM private-key blocks; scrub is idempotent and leaves ordinary text alone; opening the shared DB re-scrubs existing rows once whenever SCRUB_RULES_VERSION increases (the 'rules tighten' re-scrub, recorded in schema_meta) with no new CLI or slash command; fixture tests use runtime-built fake secrets only; SpecSync + fledge verify green

## Evidence

- Verification commit: `fd7a9ea1400c734c4ef82e06e572278ec9288d61`
- Base commit: `c3b4d8881ea2d9a5b968eb47b9eda35c6e1b2233`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Issue #66 (M1, P1). Sessions are durable since #61 and memory since #64, but
nothing scrubbed secrets before writing — users paste tokens into Discord
prompts and the agent summaries can echo them. `hi/safe.md` **SAFE-6** is
captured: "Secrets that look like vendor keys are scrubbed before sessions are
saved, and I can re-scrub history when rules tighten."

Draft **SAFE-10** (outbound Discord/AlgoChat replies, audit log, backups,
dashboard, Discord-admin re-scrub command) and Algorand mnemonics are NOT
captured — left for HI capture. The issue rules out a human CLI subcommand,
so the re-scrub is automatic: bump `SCRUB_RULES_VERSION` when rules tighten
and the next DB open re-scrubs stored rows once.

## From the change's design.md

# Design

- `src/store/scrub.ts`: `scrubSecrets`, `scrubOpt`, `SCRUB_TARGETS`,
  `rescrubDatabase`, `ensureScrubbed`, `SCRUB_RULES_VERSION`.
- Scrub at the persist boundary (SQL params), so in-memory objects for a live
  run are unchanged; what reaches disk is scrubbed. Memory store scrubs key +
  content before the upsert lookup.
- No schema change: the rules version lives in `schema_meta`.

## From the change's testing.md

# Testing

- `tests/store.scrub.test.ts`: each vendor shape redacted and idempotent;
  ordinary text untouched; sessions/work/schedules/runs/memories persist
  scrubbed; raw rows re-scrubbed on next open when the rules version is
  behind; memory-key collision suffix; second open is a no-op.
- `bun test`, `bunx tsc --noEmit`, `specsync check`,
  `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-066 | `tests/store.scrub.test.ts` |

## Where these lessons go

- `specs/discord/context.md`
