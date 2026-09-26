---
id: safe-6-secret-scrub-before-persist-automatic-re-scrub-issue-66-captured-slice-scrub-vendor-key-looking-secrets-github
state: archived
type: feature
base_commit: c3b4d8881ea2d9a5b968eb47b9eda35c6e1b2233
---

# SAFE-6 secret scrub before persist + automatic re-scrub (issue #66 captured slice): scrub vendor-key-looking secrets (GitHub, OpenAI-compatible, Anthropic, Discord bot, Slack, AWS, Google, JWT, bearer, private-key blocks) on every SQLite write path (sessions, work tasks, schedules + runs, memories) and re-scrub existing rows automatically when the scrub rules version increases; no new CLI or slash surface; draft SAFE-10 outbound/Discord-admin re-scrub and Algorand mnemonics left for HI capture

## Intent

SAFE-6 secret scrub before persist + automatic re-scrub (issue #66 captured slice): scrub vendor-key-looking secrets (GitHub, OpenAI-compatible, Anthropic, Discord bot, Slack, AWS, Google, JWT, bearer, private-key blocks) on every SQLite write path (sessions, work tasks, schedules + runs, memories) and re-scrub existing rows automatically when the scrub rules version increases; no new CLI or slash surface; draft SAFE-10 outbound/Discord-admin re-scrub and Algorand mnemonics left for HI capture

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- Every SQLite write path (discord_sessions.topic, discord_work_tasks.description/summary, schedules name/description/prompt, schedule_runs summary/error, memories key/content) stores text with vendor-key-looking secrets replaced by [redacted:<kind>] (SAFE-6); patterns cover GitHub (ghp_/gho_/ghu_/ghs_/ghr_/github_pat_), OpenAI-compatible sk-/sk-proj-, Anthropic sk-ant-, Discord bot tokens, Slack xox?-, AWS AKIA/ASIA, Google AIza, JWTs, Bearer tokens and PEM private-key blocks; scrub is idempotent and leaves ordinary text alone; opening the shared DB re-scrubs existing rows once whenever SCRUB_RULES_VERSION increases (the 'rules tighten' re-scrub, recorded in schema_meta) with no new CLI or slash command; fixture tests use runtime-built fake secrets only; SpecSync + fledge verify green

## No-spec Rationale

Not applicable
