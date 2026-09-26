---
hi: 1
families: [SPECSYNC]
owner: leif
---

# SpecSync

## Intent

Specs are the contract. Corvidinho should read them, check them, and refuse to play dumb when they drift — by calling SpecSync, not by reimplementing it. Supporting SpecSync as a product means the agent’s happy path is the same path a careful human already uses.

## Criteria

- **SPECSYNC-1**  In a repo that already has `.specsync/` and `specs/`, Corvidinho can list and read module specs before it edits code.
- **SPECSYNC-2**  It can run SpecSync’s check (including the strictness we use in CI) and treat failures as real blockers for “done.”
- **SPECSYNC-3**  Coverage and score reports are available when I ask, so “are we drifting?” is answered with SpecSync’s numbers, not a guess.
- **SPECSYNC-4**  If the project uses the verified change workflow, the agent can work inside that shape without turning the change machinery off.
- **SPECSYNC-5**  Companion briefing files next to a spec are something it actually reads when starting work on that module.
- **SPECSYNC-6**  Corvidinho never needs SpecSync’s cloud or an API key of SpecSync’s own; local binary + project files are enough.
- **SPECSYNC-7**  Supporting SpecSync means staying compatible with how Fledge wires `spec-check` into lanes, so one green verify means both tools agreed.
