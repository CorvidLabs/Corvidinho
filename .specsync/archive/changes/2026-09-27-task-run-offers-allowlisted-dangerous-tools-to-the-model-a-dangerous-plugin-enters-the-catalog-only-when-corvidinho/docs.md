---
change: task-run-offers-allowlisted-dangerous-tools-to-the-model-a-dangerous-plugin-enters-the-catalog-only-when-corvidinho
artifact: docs
---

# Docs

- `specs/agent/agent.spec.md`: the new test file in `files:`, a Public API
  paragraph (`SAFE3_PENDING_TOOLS`, `allowlistOffers`, `editsFilesUnreported`,
  `BuildToolsOpts.allowlist`, `ExecuteResult.unreportedEditTools`), two
  Invariants paragraphs, a scenario and three Error Cases rows.
- `specs/agent/requirements.md` / `specs/agent/testing.md`: REQ-agent-501 /
  502 added, REQ-agent-009 / 112 / 128 / 085 amended, a testing section.
- `docs/DISCORD-GO-LIVE.md`: owner-only list (memory forget/override), E.3
  intro, table rows (memory, GitHub writes, shell and runners) and "What an
  entry unlocks": the task-run catalog now offers allowlisted dangerous tools
  to ADMIN / local runs, never shell and runners, Fledge discovery and the
  non-git verify, and the `/work` PR tools being offered to the owner's runs.
- `docs/discord.md`: memory forget/override reach the owner's chat when
  allowlisted; the `/work` PR step paragraph.
- `docs/WATCH.md`: GitHub writes are never offered to WATCH runs (non-ADMIN);
  the allowlist offers them to the owner's runs.
- `.env.example` and `STATUS.md`: the same.
- No README, CHANGELOG or package version change; no new env var or flag.
