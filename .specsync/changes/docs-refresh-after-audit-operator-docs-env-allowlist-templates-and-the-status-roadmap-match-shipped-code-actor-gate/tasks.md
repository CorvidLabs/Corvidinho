---
change: docs-refresh-after-audit-operator-docs-env-allowlist-templates-and-the-status-roadmap-match-shipped-code-actor-gate
artifact: tasks
---

# Tasks

- [x] Re-verify every audit finding and the bridge report's discord.md drift against main (dbe37ce); drop the ones already fixed (CHANGELOG 0.0.22/Unreleased gap, TOML multi-line warning, /work reply-continue drift)
- [x] Add `tests/docs.operator-facts.test.ts` and record it failing on the old docs (15 fail / 6 pass)
- [x] Fix AGENTS.md, README.md, STATUS.md (ROADMAP rows, placeholders, table break), CHANGELOG.md factual errors
- [x] Fix docs/DISCORD-GO-LIVE.md, docs/BOX-UPDATE.md, docs/UPDATE.md, docs/WATCH.md, docs/discord.md, docs/DAEMON.md
- [x] Fix allowlist.example.toml and .env.example (template still parses with the fail-closed loader)
- [x] Docs test passes (21 / 21); specsync check, tsc, bun test and the verify lane green
- [x] Review: merge main (#213, #214, #218, #219, #220, #224), re-verify every changed statement, fix the Server Members Intent claim and the post-merge drift; three more docs-facts tests (24 / 24; the three fail on the unfixed docs)
