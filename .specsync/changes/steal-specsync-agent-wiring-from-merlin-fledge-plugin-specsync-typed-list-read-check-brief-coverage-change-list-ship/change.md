---
id: steal-specsync-agent-wiring-from-merlin-fledge-plugin-specsync-typed-list-read-check-brief-coverage-change-list-ship
state: implementing
type: feature
base_commit: b55ff627783de1b7d5ce5c0ed9c75c618d9b546b
---

# STEAL SpecSync agent wiring from Merlin fledge-plugin-specsync: typed list/read/check/brief/coverage + change list/ship-status; Planning companion briefing; SpecSync check blocks prove-before-done (SPECSYNC-1..7); keep CI Spec Sync Action separate from fledge verify lane

## Intent

STEAL SpecSync agent wiring from Merlin fledge-plugin-specsync: typed list/read/check/brief/coverage + change list/ship-status; Planning companion briefing; SpecSync check blocks prove-before-done (SPECSYNC-1..7); keep CI Spec Sync Action separate from fledge verify lane

## Affected Canonical Specs

- `agent`
- `plugins`
- `cli`

## Acceptance Criteria

- Agent/CLI can list and read specs/ via typed plugins (specsync-list/read) and CLI; companion brief loads context.md/tasks.md/etc when modules targeted (SPECSYNC-5); specsync check failure blocks prove-before-done verified=true (SPECSYNC-2) while fledge verify lane stays SpecSync-free (CI Spec Sync Action separate); coverage/score and change list/ship-status available when asked; no SpecSync API key; bun test + SpecSync Action green; change archived

## No-spec Rationale

Not applicable
