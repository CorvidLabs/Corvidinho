---
change: steal-specsync-agent-wiring-from-merlin-fledge-plugin-specsync-typed-list-read-check-brief-coverage-change-list-ship
artifact: context
---

# Context

Issue #8: STEAL SpecSync agent wiring from Merlin `fledge-plugin-specsync` + plan-time `spec_loader.rs`. SDD already ON — do **not** reimplement SpecSync. Wire list/read/check as typed plugins the agent loop can call; feed Planning + done-gate via verify-lane `spec-check`.

Already on main: plugin host (#15), default-deny allowlists (#18), prove-before-done agent loop (#17). Planning still emits a placeholder ("specs briefing deferred"). `fledge.toml` has `[tasks.spec-check]` but verify lane does **not** run it yet (STATUS previously kept SpecSync only in the dedicated CI Action).

Merlin steal targets:
- `plugins/fledge-plugin-specsync/` — `specsync-list|read|check` (+ create out of first slice)
- `crates/merlin-core/src/spec_loader.rs` — token-overlap select + constraint extract at Planning
- `fledge.toml` `[lanes.verify]` includes `spec-check`

Out of scope: #19, iced UI, SpecSync cloud/API key, Trust/Augur/Attest, inventing ACCESS/bounty/MainNet.
