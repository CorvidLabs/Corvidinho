---
id: docs-and-the-doctor-docs-facts-test-follow-225-doctor-reads-the-allowlist-file-checks-data-dir-and-llm-and-its-checks
state: approved
type: documentation
base_commit: a0e27ae09119184dc2c2c48e71076f8f3c7aaf35
---

# Docs and the doctor docs-facts test follow #225: doctor reads the allowlist file, checks data-dir and llm, and its checks live in src/doctor.ts

## Intent

docs and the doctor docs-facts test follow #225: doctor reads the allowlist file, checks data-dir and llm, and its checks live in src/doctor.ts

## Affected Canonical Specs

- None

## Acceptance Criteria

- docs/BOX-UPDATE.md and docs/DISCORD-GO-LIVE.md describe doctor as merged with #225 (allowlist file + env for discord and github-watch, deny wins, data-dir, llm warn, allowlist-file parse failure) and keep the refresh's .env note; tests/docs.operator-facts.test.ts finds every doctor check name in src/cli.ts or src/doctor.ts, including data-dir, and passes.

## No-spec Rationale

Docs-only merge follow-up: #225 changed doctor behaviour and moved checks into src/doctor.ts; the docs and the docs-facts test catch up. No spec or source change.
