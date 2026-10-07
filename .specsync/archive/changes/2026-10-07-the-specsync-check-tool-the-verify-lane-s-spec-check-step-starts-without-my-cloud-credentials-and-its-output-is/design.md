---
change: the-specsync-check-tool-the-verify-lane-s-spec-check-step-starts-without-my-cloud-credentials-and-its-output-is
artifact: design
---

# Design

- `plugins/specsync/api.ts`: one private helper `spawnWithoutCloud(argv, cwd,
  env, signal)` spawns with the given env, collects stdout + stderr, passes
  them through `scrubSecrets(redactSecretEnvValues(…))` (SAFE-6, as
  `shell-exec` and the runners do) and calls `releaseCloudStandIns(env)` in a
  `finally` (also when `Bun.spawn` throws).
- `runSpecCheck` (Fledge path): env = `withoutCloudCredentials(buildVerifyEnv())`,
  exactly what `runFledgeStep` gives the verify lane, which runs this same
  `spec-check` task as a lane step.
- `spawnSpecsync` (plain `specsync check` fallback and the other SpecSync
  tools): env = `withoutCloudCredentials` of `process.env` at call time
  (CLI-5: the project's env, not the start-up one). The verify-lane drop list
  is not applied here, since `specsync change ship` reads `GITHUB_TOKEN` for
  check-runs; only the cloud family goes.
- `withoutGitCredentials` (SAFE-21.a) is not added: the verify lane itself
  does not apply it, and this change is scoped to SAFE-21.b.
- No new export, env var, config key, slash command or schema.
