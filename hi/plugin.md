---
hi: 1
families: [PLUGIN]
owner: leif
---

# Plugin

## Intent

New capabilities should land as plugins with honest danger markings, not as special cases inside the agent core. If Fledge can see the plugin, Corvidinho should be able to use it — and I should be able to write one without forking the agent.

## Criteria

- **PLUGIN-1**  Files, search, shell, git, github, web, memory, SpecSync, and Fledge itself are available as plugins with typed commands.
- **PLUGIN-2**  Every command declares whether it is dangerous and what minimum tier it needs, and the runtime enforces that declaration.
- **PLUGIN-3**  I can add a project or third-party Fledge plugin and have Corvidinho call it without a Corvidinho release.
- **PLUGIN-4**  Language runners I care about on Linux (at least shell plus node/python/cargo when present) show up as plugins that degrade cleanly when the toolchain is missing.
- **PLUGIN-5**  Autonomous extras (work tasks, councils, scheduling, …) are plugins I can leave disabled until I opt in.
- **PLUGIN-6**  I can list what is loaded and see enough schema detail to understand why context got expensive.
