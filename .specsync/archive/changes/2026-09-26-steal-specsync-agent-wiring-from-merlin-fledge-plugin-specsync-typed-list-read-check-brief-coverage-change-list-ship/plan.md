---
change: steal-specsync-agent-wiring-from-merlin-fledge-plugin-specsync-typed-list-read-check-brief-coverage-change-list-ship
artifact: plan
---

# Plan

1. `plugins/specsync/` — list/read (registry + specs files), check (`fledge run spec-check` → `specsync check` fallback), brief (companions), coverage, change-list, ship-status
2. `src/agent/specLoader.ts` — port Merlin `spec_loader.rs` (select_relevant_specs, extract_constraint_sections)
3. `src/agent/loop.ts` — Planning: loadRelevantSpecs(task) via plugins; emit briefing Text; optional `task` on RunTaskOptions
4. `fledge.toml` — add `spec-check` to `[lanes.verify]` (and document CI Action still separate)
5. Wire builtins + CLI help; update agent/plugins/cli specs + STATUS/AGENTS
6. Tests: plugins list/read/check; specLoader unit; planning briefing; verify lane includes spec-check
7. SpecSync check + bun test + draft PR → #8; archive on finalize; merge when green
