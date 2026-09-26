---
change: test-suite-never-reads-the-operator-allowlist-file-preload-and-custom-env-tests-point-corvidinho-allowlist-file-at-a
artifact: design
---

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
