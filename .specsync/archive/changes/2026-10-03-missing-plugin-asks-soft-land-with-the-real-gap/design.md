---
change: missing-plugin-asks-soft-land-with-the-real-gap
artifact: design
---

# Design

- `src/agent/missing-capability.ts` classifies the task against the offered catalog, the registry, the allowlist, the acting role, the tier, known keys (`GIPHY_API_KEY`, `BRAVE_SEARCH_API_KEY`; `TENOR_API_KEY` only as the existing fledge-gif alias, never named as a new provider), and an optional Fledge plugin list.
- `createTaskExecute` returns that reply before any model call when nothing matching is offered. Otherwise it adds a short capability note and `MISSING_CAPABILITY_INSTRUCTIONS`.
- A vague install `ask-human` or a short vague prose reply is replaced by the gap, or steered back to the offered tool.
- A tool name the model invented is still "not offered", plus the concrete gap when one is known.
- Open PRs come from `gh pr list` on CorvidLabs/Corvidinho (skipped when `citeOpenPrs` is false). HI ids are read from `hi/*.md` lines that contain the needle.
- ADMIN vs community gates are unchanged. The classifier does not register tools or widen the catalog.
