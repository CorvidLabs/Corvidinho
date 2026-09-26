# Lesson bundle — tag-push-v-creates-idempotent-verbose-github-release-scripts-corvidinho-update-sh-safe-box-update-with-sha-record

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Tag push v* creates idempotent verbose GitHub Release; scripts/corvidinho-update.sh safe box update with SHA record, checkout tag/main, bun install, optional doctor, stop bridge via pidfile, start with documented secrets env (no hardcoded secrets), wait for logged in/protocol OK or rollback; docs/UPDATE.md; bump 0.0.3; never post Discord panic on failure
- **Kind**: Operations
- **Paths**: .github/workflows, scripts, docs/UPDATE.md, STATUS.md, package.json, tests
- **Acceptance**: 1) push tag v* runs workflow that creates GitHub Release (verbose logs) with body from CHANGELOG section or generated commits since previous tag; idempotent if release already exists (exit 0, no fail). 2) scripts/corvidinho-update.sh: fetch; record previous SHA; checkout TAG or main; bun install; optional doctor; stop bridge via /tmp/corvidinho-discord-bridge.pid cleanly; start bridge with env from secrets pattern (document only — never hardcode secrets); wait for '[discord] logged in' or protocol OK in log within timeout else rollback to previous SHA + restart; failures log only — never Discord panic posts. 3) docs/UPDATE.md points at releases + update script. 4) package.json 0.0.3 + STATUS notes; shell-logic unit tests for parse/rollback helpers where testable; fledge verify green.

## Evidence

- Verification commit: `b89dee06393a9ebee96dfcf60847eec1ba00552a`
- Base commit: `d0ba4e4df48302ed18a682a21a79d83b79ac0c4e`
- Verified by: `specsync check --spec agent --spec cli --spec discord`

## From the change's context.md

# Context

v0.0.2 release notes explicitly deferred **Tag→Release Action** and a **crash-safe updater script**. Bot box updates today are manual `git fetch` + restart; a bad tip can strand the Discord bridge with no automatic rollback, and tag pushes do not create GitHub Releases.

Constraints:
- Secrets stay in VM env / EnvironmentFile — never hardcode in scripts or workflows.
- Update failures must **log only** — never post panic / status spam to Discord.
- Bridge stop uses pidfile `/tmp/corvidinho-discord-bridge.pid` (documented contract).
- Ready signals already logged by the bridge: `[discord] logged in` and `protocol version … OK`.

## From the change's design.md

# Design

- **Release Action:** GitHub-hosted `ubuntu-latest`; `contents: write`; softprops v2 with `generate_release_notes: true` and optional CHANGELOG excerpt; pre-check `gh release view` for idempotency (exit 0 if exists).
- **Update script:** bash, `set -euo pipefail`; repo root via `CORVIDINHO_ROOT` (default script parent); target ref via `CORVIDINHO_REF` (default `main`); env file via `CORVIDINHO_ENV_FILE` (default `~/.config/corvidinho/env` — sourced if present, never committed); log to `CORVIDINHO_BRIDGE_LOG` (default `/tmp/corvidinho-discord-bridge.log`); pidfile fixed at `/tmp/corvidinho-discord-bridge.pid`.
- **Ready match:** substring `[discord] logged in` OR `protocol version` + `OK` in recent log lines.
- **Rollback:** on ready timeout or start failure, `git checkout <previous_sha>`, reinstall, restart; always log — never Discord REST.
- **No ProcessManager** — thin ops only.

## From the change's testing.md

# Testing

- Unit (bash helpers via bun spawn): `log_indicates_ready` true for logged-in / protocol OK lines; false for unrelated noise.
- Unit: `extract_changelog_section` returns matching version body when present.
- Smoke: `bash -n scripts/corvidinho-update.sh` syntax check.
- Workflow YAML present and triggers on `v*` (file assert in test).
- `bun test` + `fledge lanes run verify --non-interactive`.

## Automated coverage

- `bun test tests/update-helpers.test.ts`
- `bunx tsc --noEmit`
- `specsync check`
- `fledge lanes run verify --non-interactive`

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
