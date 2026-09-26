---
id: tag-push-v-creates-idempotent-verbose-github-release-scripts-corvidinho-update-sh-safe-box-update-with-sha-record
state: implementing
type: operations
base_commit: d0ba4e4df48302ed18a682a21a79d83b79ac0c4e
---

# Tag push v* creates idempotent verbose GitHub Release; scripts/corvidinho-update.sh safe box update with SHA record, checkout tag/main, bun install, optional doctor, stop bridge via pidfile, start with documented secrets env (no hardcoded secrets), wait for logged in/protocol OK or rollback; docs/UPDATE.md; bump 0.0.3; never post Discord panic on failure

## Intent

Tag push v* creates idempotent verbose GitHub Release; scripts/corvidinho-update.sh safe box update with SHA record, checkout tag/main, bun install, optional doctor, stop bridge via pidfile, start with documented secrets env (no hardcoded secrets), wait for logged in/protocol OK or rollback; docs/UPDATE.md; bump 0.0.3; never post Discord panic on failure

## Affected Canonical Specs

- None

## Acceptance Criteria

- 1) push tag v* runs workflow that creates GitHub Release (verbose logs) with body from CHANGELOG section or generated commits since previous tag; idempotent if release already exists (exit 0, no fail). 2) scripts/corvidinho-update.sh: fetch; record previous SHA; checkout TAG or main; bun install; optional doctor; stop bridge via /tmp/corvidinho-discord-bridge.pid cleanly; start bridge with env from secrets pattern (document only — never hardcode secrets); wait for '[discord] logged in' or protocol OK in log within timeout else rollback to previous SHA + restart; failures log only — never Discord panic posts. 3) docs/UPDATE.md points at releases + update script. 4) package.json 0.0.3 + STATUS notes; shell-logic unit tests for parse/rollback helpers where testable; fledge verify green.

## No-spec Rationale

Ops: tag→GitHub Release Action, safe box update script with pidfile stop/start + rollback, docs/UPDATE.md. No canonical HI/spec behavior change; STATUS notes + patch bump for user-visible update docs.
