---
id: enhance-corvidinho-update-sh-with-pidfile-tmp-corvidinho-discord-bridge-pid-stop-start-and-wait-for-logged-in-or
state: archived
type: operations
base_commit: 92519c3c18fa98a6c895cb55196b5529b77c711b
---

# Enhance corvidinho-update.sh with pidfile /tmp/corvidinho-discord-bridge.pid stop/start and wait for logged-in or protocol OK else rollback; docs/UPDATE.md pointer; release workflow idempotent if release exists; helper tests; bump 0.0.3

## Intent

Enhance corvidinho-update.sh with pidfile /tmp/corvidinho-discord-bridge.pid stop/start and wait for logged-in or protocol OK else rollback; docs/UPDATE.md pointer; release workflow idempotent if release exists; helper tests; bump 0.0.3

## Affected Canonical Specs

- None

## Acceptance Criteria

- 1) update script stops/starts bridge via /tmp/corvidinho-discord-bridge.pid (keeps systemd/BRIDGE_CMD); waits for [discord] logged in or protocol OK in log within timeout else rollback+restart; never Discord panic. 2) docs/UPDATE.md short pointer to BOX-UPDATE + pidfile/ready notes. 3) release.yml idempotent when release exists. 4) helper unit tests. 5) package 0.0.3 + STATUS/CHANGELOG.

## No-spec Rationale

Ops polish on #45: pidfile + ready-wait + UPDATE.md + release idempotency + tests + 0.0.3. No HI/canonical spec behavior change.
