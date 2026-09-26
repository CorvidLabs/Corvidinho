---
change: steal-specsync-agent-wiring-from-merlin-fledge-plugin-specsync-typed-list-read-check-brief-coverage-change-list-ship
artifact: design
---

# Design

**Plugins (not a second SpecSync):** list/read parse project files the same way Merlin’s plugin does. check shells out to `fledge run spec-check` (fallback `specsync check`). coverage / change list / ship-status spawn the local SpecSync binary.

**Plan-time:** `loadRelevantSpecs(cwd, task)` → list names → `select_relevant_specs(task, names, 3)` → read each → `extract_constraint_sections` + companion snippets → return briefing string. Loop emits `Text` during Planning. Soft-fail if registry/plugins missing (Merlin returns Ok(())).

**Done-gate:** add `spec-check` to `[lanes.verify]` so existing `defaultVerifyRunner` (`fledge lanes run verify`) already blocks on SpecSync. Do not invent a parallel SpecSync-only gate in the loop. CI `.github/workflows/spec-sync.yml` stays.

**CLI:** thin `corvidinho specsync <list|read|check|brief|coverage|change-list|ship-status>` forwarding to plugins for operator ergonomics.
