# Lesson bundle — enhance-corvidinho-update-sh-with-pidfile-tmp-corvidinho-discord-bridge-pid-stop-start-and-wait-for-logged-in-or

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Enhance corvidinho-update.sh with pidfile /tmp/corvidinho-discord-bridge.pid stop/start and wait for logged-in or protocol OK else rollback; docs/UPDATE.md pointer; release workflow idempotent if release exists; helper tests; bump 0.0.3
- **Kind**: Operations
- **Paths**: scripts, docs/UPDATE.md, .github/workflows/release.yml, STATUS.md, package.json, tests, CHANGELOG.md
- **Acceptance**: 1) update script stops/starts bridge via /tmp/corvidinho-discord-bridge.pid (keeps systemd/BRIDGE_CMD); waits for [discord] logged in or protocol OK in log within timeout else rollback+restart; never Discord panic. 2) docs/UPDATE.md short pointer to BOX-UPDATE + pidfile/ready notes. 3) release.yml idempotent when release exists. 4) helper unit tests. 5) package 0.0.3 + STATUS/CHANGELOG.

## Evidence

- Verification commit: `cb44514eb2f584599753737149bb00ee9ff8e819`
- Base commit: `92519c3c18fa98a6c895cb55196b5529b77c711b`
- Verified by: `specsync check --spec agent --spec cli --spec discord`

## From the change's context.md

# Context

#45 shipped tag→Release + updater + `docs/BOX-UPDATE.md` but omitted the task’s pidfile stop/start (`/tmp/corvidinho-discord-bridge.pid`), ready-log wait (`[discord] logged in` / protocol OK), explicit release idempotency, `docs/UPDATE.md`, helper tests, and 0.0.3 bump for user-visible update docs.

## From the change's design.md

# Design

Restart preference: pidfile path when present or `CORVIDINHO_USE_PIDFILE=1`; else existing UNIT/BRIDGE_CMD. Ready match via helpers. Env file `CORVIDINHO_ENV_FILE` sourced before start. Rollback restores SHA and restarts the same way. Release job: `gh release view` → skip create if exists.

## From the change's testing.md

# Testing

- `log_indicates_ready` / `should_rollback` via bash from bun test
- release.yml contains Idempotency + softprops
- package.json 0.0.3; `bash -n` on scripts

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
