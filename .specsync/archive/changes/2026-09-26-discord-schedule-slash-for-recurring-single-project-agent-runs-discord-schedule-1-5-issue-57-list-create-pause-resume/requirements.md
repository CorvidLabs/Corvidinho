---
change: discord-schedule-slash-for-recurring-single-project-agent-runs-discord-schedule-1-5-issue-57-list-create-pause-resume
artifact: requirements
---

# Requirements

1. Slash `/schedule` with subcommands `list|create|pause|resume|delete`
   (DISCORD-SCHEDULE-1..2). Skip templates/pipelines this cut.
2. `create` accepts human-readable cadence (cron, `@hourly`/`@daily`/…, or
   `every N minutes|hours`) plus **one** target `project` and a `prompt`
   (work to run). Optional `channel` for result posts must be allowlisted.
3. Mutations (`create|pause|resume|delete`) require ADMIN, re-checked at
   handler time; empty admin/owner lists = deny-all. `list` is available to
   allowlisted actors after normal channel/rate gates.
4. Minimum schedule interval is **5 minutes** (cron gap or interval); shorter
   cadences are refused at create time.
5. Schedules persist in the shared Corvidinho SQLite DB (same file as SESSION
   store). Bridge starts a cooperative ~60s ticker that fires due active
   schedules asynchronously with a small concurrency cap so Discord HEAR and
   GitHub WATCH ingress stay ≤ ~1 minute (DISCORD-SCHEDULE-4).
6. Ticks respect channel/user allowlists and existing SAFE gates; a schedule
   cannot post to a non-allowlisted channel (DISCORD-SCHEDULE-3).
7. Provenance: steal corvid-agent schedule slash + scheduler + ADR; no
   flock/council/on-chain/ProcessManager (DISCORD-SCHEDULE-5).
8. Fixture tests without live Discord; SpecSync + `fledge lanes run verify`
   green.
