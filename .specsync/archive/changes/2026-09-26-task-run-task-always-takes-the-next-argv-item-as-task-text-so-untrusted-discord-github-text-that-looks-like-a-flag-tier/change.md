---
id: task-run-task-always-takes-the-next-argv-item-as-task-text-so-untrusted-discord-github-text-that-looks-like-a-flag-tier
state: archived
type: bug_fix
base_commit: 20fb34ff8db5759a2aad968e74d1d21b4c344b83
---

# Task run --task always takes the next argv item as task text, so untrusted Discord/GitHub text that looks like a flag (--tier=code, --no-verify) can never be parsed as a CLI flag; --task=TEXT may span lines

## Intent

task run --task always takes the next argv item as task text, so untrusted Discord/GitHub text that looks like a flag (--tier=code, --no-verify) can never be parsed as a CLI flag; --task=TEXT may span lines

## Affected Canonical Specs

- `cli`

## Acceptance Criteria

- A --task value starting with - is kept as task text; tier/max-retries/verify flags inside task text are never applied; multi-line --task= keeps all lines; fixture tests

## No-spec Rationale

Not applicable
