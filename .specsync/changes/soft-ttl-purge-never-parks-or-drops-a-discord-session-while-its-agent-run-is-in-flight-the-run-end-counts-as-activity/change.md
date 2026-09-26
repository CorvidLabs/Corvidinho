---
id: soft-ttl-purge-never-parks-or-drops-a-discord-session-while-its-agent-run-is-in-flight-the-run-end-counts-as-activity
state: draft
type: bug_fix
base_commit: cfcf2b7c6ab71ed46ce4f319969c26bc3c599c0f
---

# Soft-TTL purge never parks or drops a Discord session while its agent run is in flight; the run end counts as activity (SESSION-2, SESSION-WORKTREE-3)

## Intent

Soft-TTL purge never parks or drops a Discord session while its agent run is in flight; the run end counts as activity (SESSION-2, SESSION-WORKTREE-3)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- A session whose agent run is in flight (bridge chat, /work, /session start) is never dropped or worktree-parked by the soft-TTL purge on get/getByThread/getByBotMessage/list; the run end refreshes lastActivityAt; an idle session past the TTL after its run still purges and parks; fixture tests with a real temp git repo and injected clock

## No-spec Rationale

Not applicable
