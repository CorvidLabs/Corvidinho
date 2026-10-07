---
change: the-specsync-check-tool-the-verify-lane-s-spec-check-step-starts-without-my-cloud-credentials-and-its-output-is
artifact: plan
---

# Plan

1. `plugins/specsync/api.ts`: add `spawnWithoutCloud`; `runSpecCheck` uses
   `withoutCloudCredentials(buildVerifyEnv())`, `spawnSpecsync` uses
   `withoutCloudCredentials` of `process.env`; output scrubbed; stand-ins
   released.
2. Test in `tests/agent.cloud-credentials.test.ts` (child bun process with the
   owner's env, stand-in fledge / specsync, both scenarios, GitHub token value
   absent from output); swap main's `api.ts` in to prove it fails, restore.
3. Deltas (REQ-plugins-621, REQ-agent-621 modified), spec prose, module
   testing evidence.
4. Approve, `change check --commit`, `change audit`, `specsync check
   --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`.
