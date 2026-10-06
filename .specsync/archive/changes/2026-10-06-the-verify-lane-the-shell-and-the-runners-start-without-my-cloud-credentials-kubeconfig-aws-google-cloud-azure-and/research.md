---
change: the-verify-lane-the-shell-and-the-runners-start-without-my-cloud-credentials-kubeconfig-aws-google-cloud-azure-and
artifact: research
---

# Research

- Sources: issue #83 (SAFE-21 / SAFE-21.a rollups; the 2026-09-26 decision
  on metadata / internal-host egress is separate and uncaptured), the
  interview record `/home/user/coord/interview-2026-09-28.md` (round 16).
- Env builders on main: `buildVerifyEnv` / `isVerifyEnvDropped`
  (`src/agent/verify.ts`, used by `defaultVerifyRunner`), `runnerChildEnv`
  (`plugins/runners/commands.ts`, used by `runRunner` and `shell-exec`),
  `fledgeCoreChildEnv` (`plugins/fledge/core.ts`). `withoutGitCredentials`
  already shows the pattern: drop keys, then point the tool at an empty
  config (`GIT_CONFIG_GLOBAL=/dev/null`, an empty `GH_CONFIG_DIR`).
- `isVerifyEnvDropped` also feeds the SAFE-21 `$NAME` secret-read refusal
  (`plugins/shell/footguns.ts`); widening it would refuse harmless reads such
  as `$KUBECONFIG` (now `/dev/null`), so the cloud scrub is a separate step.
- Tool lookups (documented behaviour): kubectl / client-go read each
  `KUBECONFIG` entry else `~/.kube/config`, and fall back to the in-cluster
  service account when `KUBERNETES_SERVICE_HOST` / `_PORT` are set; the AWS
  CLI and SDKs read `AWS_SHARED_CREDENTIALS_FILE` / `AWS_CONFIG_FILE` else
  `~/.aws/*`, then container endpoints (`AWS_CONTAINER_*`) and EC2 IMDS
  unless `AWS_EC2_METADATA_DISABLED`; gcloud reads `CLOUDSDK_CONFIG` else
  `~/.config/gcloud`; Google client libraries read
  `GOOGLE_APPLICATION_CREDENTIALS`, else the ADC well-known file (Python
  honours `CLOUDSDK_CONFIG`, Node and Go use `~/.config/gcloud`), else the GCE
  metadata server; az reads `AZURE_CONFIG_DIR` else `~/.azure`; Azure SDKs
  read `AZURE_*` env, workload identity, managed identity (`IDENTITY_*`,
  `MSI_*`, IMDS) and the az CLI.
