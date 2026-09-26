# Lesson bundle — test-suite-never-reads-the-operator-allowlist-file-preload-and-custom-env-tests-point-corvidinho-allowlist-file-at-a

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Test suite never reads the operator allowlist file (preload and custom-env tests point CORVIDINHO_ALLOWLIST_FILE at a missing file) and a malformed allowlist file contributes nothing at the GitHub plugin gate (REQ-plugins-253)
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: tests/preload.ts, tests/github.review.plugin.test.ts, tests/github.write.plugin.test.ts, tests/github.deny.cli.test.ts, tests/github.gate-allowlist-file.test.ts, tests/discord.image-attachments.test.ts, tests/discord.session-worktree.test.ts, tests/discord.thinking-bridge.test.ts, tests/discord.work-store.recovery.test.ts, tests/discord.bridge.cli.test.ts
- **Acceptance**: With an operator allowlist file admitting corvidlabs (via CORVIDINHO_ALLOWLIST_FILE or ~/.config/corvidinho/allowlist.toml) bun test has 0 failures and no test reaches api.github.com with a GitHub token set; at the GitHub plugin gate a malformed or unreadable allowlist file contributes nothing (its deny and allow entries are dropped) while env overlays still apply, and with no env allow the gate refuses

## Evidence

- Verification commit: `59d230b378c78f91e3da93b3a4d32bfb69e67aed`
- Base commit: `8129f4d1f055ea6ee19bfd9a013797fe5b140c53`
- Verified by: `specsync check --spec discord --spec plugins`

## From the change's context.md

# Context

Review of PR #191 (change github-plugin-repo-gate-reads-the-allowlist-file-…,
REQ-plugins-253) found a test-isolation regression. Since the GitHub plugin
gate (`checkRepoGateForActingRole`) now loads the allowlist file, tests that
expect "no env allow list ⇒ refused" read whatever file the machine has:
`CORVIDINHO_ALLOWLIST_FILE` or ~/.config/corvidinho/allowlist.toml|json.
`tests/preload.ts` isolated only `CORVIDINHO_DATA_DIR`.

Repro (merged tree 8129f4d, tokens unset, file `[github] orgs = ["corvidlabs"]`):
via `CORVIDINHO_ALLOWLIST_FILE` 2 failures
(tests/github.review.plugin.test.ts "empty repo allowlist refuses before any
API call", tests/github.write.plugin.test.ts "empty repo allowlist still
denies when command allowlisted"); via a temp HOME/.config/corvidinho/allowlist.toml
3 failures (plus tests/github.deny.cli.test.ts "empty allowlist denies repo",
which deleted `CORVIDINHO_ALLOWLIST_FILE` and so fell back to the home file).
On the bot VM the AGENT-4 verify runner and the /work verify spawn
`fledge lanes run verify` with the bridge env, so every bot-made Corvidinho
change would fail verify.

With a GitHub token set and the home file present, the pre-fix suite sent 2
requests to api.github.com (seen through a local refuse-all logging proxy):
the deny.cli "empty allowlist" spawn (gate now passed) and the deny.cli
"allowlisted repo reaches auth/API layer" spawn, which forwarded the caller's
token by design (pre-existing on main).

Review minor folded in: REQ-plugins-253 said "An unreadable file SHALL add
nothing (empty ⇒ deny)", but a malformed file only drops its own entries and
env overlays still apply (same as main and WATCH). No test covered that at the
plugin gate.

## From the change's design.md

# Design

Test-only change plus a REQ wording fix; no src change.

- `tests/preload.ts`: always (not only when unset) set
  `CORVIDINHO_ALLOWLIST_FILE` to `<preload temp dir>/no-allowlist.toml`, a
  path that is never created. `resolveAllowlistPath` returns it,
  `loadAllowlist` sees it missing and adds nothing, so neither an operator's
  env var nor ~/.config/corvidinho/allowlist.* can leak in. HOME is not
  changed. Spawned CLIs inherit it through `...process.env`.
- Tests that hand a custom env object to a loader (it does not inherit
  process.env, so an unset key falls back to `os.homedir()`) pass an explicit
  missing `CORVIDINHO_ALLOWLIST_FILE`: the review and write plugin tests'
  `withEnv` helpers and the empty-allowlist test, the GITHUB-6 CLI spawns
  (set instead of `delete`), and the six `startBridge({ env: {...} })` calls
  in the discord bridge tests. Loader calls that already pass
  `filePath: null`, an explicit file, or `home` are left alone.
- The deny.cli "reaches auth/API layer" spawn now always clears
  `GITHUB_TOKEN` / `GH_TOKEN` and asserts exit 1 with the missing-token
  error: the gate still has to pass (not 3), and no test calls GitHub.
- `tests/github.gate-allowlist-file.test.ts`: `beforeEach` points at a
  missing file instead of deleting the key; new case for a truncated JSON file
  and a directory path (no env allow ⇒ refused, exit 3; env allow ⇒ applies,
  the file's deny entry does not).
- REQ-plugins-253 modified: a missing, unreadable or malformed file
  contributes nothing while env overlays still apply; the suite never reads
  the operator's file. Behaviour is unchanged (the loader already did this).

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-253` | `tests/github.gate-allowlist-file.test.ts` | new "malformed or unreadable allowlist file contributes nothing; env overlays still apply": truncated `allowlist.json` and a directory path, no env allow ⇒ `checkRepoGateForActingRole` / `checkRepoGateAsync` refuse ("allowlist empty") and github-issue-create exits 3; with `CORVIDINHO_GITHUB_ALLOW_ORGS=corvidlabs` the repo passes (dry run), the file's `deny_repos` entry does not apply, and `other/repo` is still refused. Existing file deny/allow, community and CLI cases unchanged and passing. |
| `REQ-plugins-253` | `tests/preload.ts`, `tests/github.review.plugin.test.ts`, `tests/github.write.plugin.test.ts`, `tests/github.deny.cli.test.ts` | operator file `[github] orgs = ["corvidlabs"]`, full suite: before 2 failures via `CORVIDINHO_ALLOWLIST_FILE` and 3 via temp HOME/.config/corvidinho/allowlist.toml; after 0 failures both ways (1124 pass). With a dummy `GITHUB_TOKEN` and a local refuse-all logging proxy as HTTPS_PROXY: before 2 CONNECT api.github.com, after 0. |
| `REQ-plugins-253` | `tests/discord.bridge.cli.test.ts`, `tests/discord.thinking-bridge.test.ts`, `tests/discord.image-attachments.test.ts`, `tests/discord.session-worktree.test.ts`, `tests/discord.work-store.recovery.test.ts` | custom-env `startBridge` calls pass a missing `CORVIDINHO_ALLOWLIST_FILE`; all pass with and without an operator home file. |
| `REQ-plugins-004` | `tests/github.deny.cli.test.ts`, `tests/github.deny.test.ts` | missing `--repo`, empty allow list and env deny still exit 3; allowlisted repo passes the gate and stops at the missing-token exit 1 without calling GitHub. |

## Where these lessons go

- `specs/plugins/context.md`
