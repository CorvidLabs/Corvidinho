---
change: the-verify-lane-the-shell-and-the-runners-start-without-my-cloud-credentials-kubeconfig-aws-google-cloud-azure-and
artifact: plan
---

# Plan

1. Capture SAFE-21.b with `hi` (own commit); `hi check` passes.
2. `src/agent/verify.ts`: `isCloudCredentialEnvKey`,
   `CLOUD_CREDENTIAL_STAND_INS`, `withoutCloudCredentials`,
   `releaseCloudStandIns`; `defaultVerifyRunner` uses and releases it.
3. `plugins/runners/commands.ts` (`runnerChildEnv`, `runRunner`),
   `plugins/shell/commands.ts` (handler) and `plugins/fledge/core.ts`
   (`fledgeCoreChildEnv`, `spawnFledge`): apply and release.
4. Tests: `tests/agent.cloud-credentials.test.ts` (stand-in kubectl / aws /
   gcloud / az, fake HOME, both scenarios, every surface); fail-on-base proof
   (swap the base's four sources in, run, restore).
5. Docs, spec prose and files list, module testing evidence, deltas
   (REQ-agent-621 and REQ-plugins-621 added, REQ-agent-002 modified).
6. `specsync change approve`, `change check --commit`, `change audit`,
   `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`,
   `bun test`, `fledge lanes run verify --non-interactive`.
