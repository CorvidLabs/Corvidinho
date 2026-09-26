---
change: safe-6-secret-scrub-before-persist-automatic-re-scrub-issue-66-captured-slice-scrub-vendor-key-looking-secrets-github
artifact: requirements
---

# Requirements

1. One redaction module (`src/store/scrub.ts`) redacts vendor-key-looking
   secrets as `[redacted:<kind>]`: GitHub (`ghp_/gho_/ghu_/ghs_/ghr_`,
   `github_pat_`), OpenAI-compatible `sk-` (incl. `sk-proj-`), Anthropic
   `sk-ant-`, Discord bot tokens, Slack `xox?-`, AWS `AKIA/ASIA`, Google
   `AIza`, JWTs, `Bearer` tokens, PEM private-key blocks. Idempotent;
   ordinary text untouched.
2. Every SQLite write of free text goes through it: `discord_sessions.topic`,
   `discord_work_tasks.description/summary`, `schedules.name/description/prompt`,
   `schedule_runs.summary/error`, `memories.key/content`.
3. Re-scrub: `openCorvidinhoDb` calls `ensureScrubbed`, which re-scrubs all
   stored rows once whenever `SCRUB_RULES_VERSION` is newer than the value in
   `schema_meta.scrub_rules_version`. No CLI/slash surface.
4. A re-scrubbed memory key that collides with an existing active key gets a
   short row-id suffix so the unique index holds.
5. Fixture tests build fake secrets at runtime (no realistic literals).
