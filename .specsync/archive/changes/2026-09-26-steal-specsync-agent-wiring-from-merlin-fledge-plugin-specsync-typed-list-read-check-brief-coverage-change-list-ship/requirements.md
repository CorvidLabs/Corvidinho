---
change: steal-specsync-agent-wiring-from-merlin-fledge-plugin-specsync-typed-list-read-check-brief-coverage-change-list-ship
artifact: requirements
---

# Requirements

- SPECSYNC-1: typed `specsync-list` / `specsync-read` over local `.specsync/registry.toml` + `specs/`
- SPECSYNC-2/7: `spec-check` on verify lane so prove-before-done blocks on SpecSync check failure; CI Spec Sync Action stays
- SPECSYNC-3: cheap `specsync-coverage` (spawn local `specsync coverage`) when asked
- SPECSYNC-4: keep working inside verified change workflow (this change)
- SPECSYNC-5: companion files (`context.md`, `tasks.md`, …) included in brief when a module is loaded for Planning
- SPECSYNC-6: local SpecSync binary + project files only; no SpecSync cloud key
- Plan-time Merlin pattern: list → select_relevant_specs(task, top 3) → read → extract Purpose/Invariants/Public API/Error Cases → emit Text briefing
- Lean change list / ship-status plugins if cheap (spawn `specsync change list|ship-status`)
- No #19 work; no Fledge Actions; no reimplement SpecSync product
