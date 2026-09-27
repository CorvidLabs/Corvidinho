---
id: docs-refresh-after-audit-operator-docs-env-allowlist-templates-and-the-status-roadmap-match-shipped-code-actor-gate
state: verifying
type: documentation
base_commit: dbe37ce53abf815e39aa7a614b0361d9332bc0d4
---

# Docs refresh after audit: operator docs, env/allowlist templates and the STATUS roadmap match shipped code (actor gate, requester ping, fail-closed allowlist file, 0.0.21-0.0.27 slices)

## Intent

Docs refresh after audit: operator docs, env/allowlist templates and the STATUS roadmap match shipped code (actor gate, requester ping, fail-closed allowlist file, 0.0.21-0.0.27 slices)

## Affected Canonical Specs

- None

## Acceptance Criteria

- Every stale or wrong fact from the docs audit that is still true on main is corrected in AGENTS.md, README.md, STATUS.md, CHANGELOG.md (factual fixes only), docs/DISCORD-GO-LIVE.md, docs/BOX-UPDATE.md, docs/UPDATE.md, docs/WATCH.md, docs/discord.md, docs/DAEMON.md, allowlist.example.toml and .env.example; every command and env name they cite exists in code; tests/docs.operator-facts.test.ts fails on the old docs and passes on the new ones

## No-spec Rationale

Documentation and templates only, plus a docs-facts regression test under tests/; no runtime behavior, public API or canonical spec requirement changes
