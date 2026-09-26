---
id: steal-specsync-agent-wiring-from-merlin-fledge-plugin-specsync-typed-list-read-check-brief-coverage-change-list-ship
state: archived
type: feature
base_commit: b55ff627783de1b7d5ce5c0ed9c75c618d9b546b
---

# STEAL SpecSync agent wiring from Merlin fledge-plugin-specsync: typed list/read/check/brief/coverage + change list/ship-status; Planning companion briefing; SpecSync check blocks prove-before-done (SPECSYNC-1..7); plan-time list/read + verify-lane spec-check; CI Spec Sync Action remains dedicated

## Intent

STEAL SpecSync agent wiring from Merlin fledge-plugin-specsync: typed list/read/check/brief/coverage + change list/ship-status; Planning companion briefing; SpecSync check blocks prove-before-done (SPECSYNC-1..7); plan-time list/read + verify-lane spec-check; CI Spec Sync Action remains dedicated

## Affected Canonical Specs

- `agent`
- `plugins`
- `cli`

## Acceptance Criteria

- Agent/CLI can list and read specs/ via typed plugins (specsync-list/read) and CLI; companion brief loads context.md/tasks.md/etc when modules targeted (SPECSYNC-5); plan-time Merlin spec_loader list/read feeds Planning; spec-check is on lanes.verify so SpecSync check failures block prove-before-done verified=true (SPECSYNC-2/7); CI Spec Sync Action remains a dedicated workflow alongside Bun smoke; coverage and change list/ship-status available when asked; no SpecSync API key; bun test + SpecSync Action green; change archived

## No-spec Rationale

Not applicable
