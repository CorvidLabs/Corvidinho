---
change: the-verify-lane-the-shell-and-the-runners-start-without-my-cloud-credentials-kubeconfig-aws-google-cloud-azure-and
artifact: tasks
---

# Tasks

- [x] Capture SAFE-21.b with `hi` (own commit); `hi check` passes.
- [x] `src/agent/verify.ts`: cloud credential family, stand-ins, `withoutCloudCredentials`, `releaseCloudStandIns`; `defaultVerifyRunner` applies and releases them.
- [x] `plugins/runners/commands.ts`, `plugins/shell/commands.ts`, `plugins/fledge/core.ts`: child env applies the cloud scrub; the spawn releases it.
- [x] Tests: `tests/agent.cloud-credentials.test.ts`; fail-on-base proof recorded in testing.md.
- [x] Docs (`docs/DISCORD-GO-LIVE.md`), spec prose and files list, module testing evidence, deltas.
- [x] `specsync change approve`, `change check --commit`, `change audit`, `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
