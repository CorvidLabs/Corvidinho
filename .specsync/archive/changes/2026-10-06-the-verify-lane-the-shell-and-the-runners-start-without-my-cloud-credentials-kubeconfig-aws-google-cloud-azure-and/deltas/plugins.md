---
module: plugins
change: the-verify-lane-the-shell-and-the-runners-start-without-my-cloud-credentials-kubeconfig-aws-google-cloud-azure-and
---

# Delta: plugins (shell-exec, the language runners and the Fledge core runs start without the owner's cloud credentials — SAFE-21.b)

## Added

### REQUIREMENT REQ-plugins-621

The `shell-exec` child, the language runners' children (`node-exec`,
`python-exec`, `cargo-exec`, REQ-plugins-313) and the Fledge core runs
(`fledge-lanes-run`, `fledge-run`, and the two lane reads, REQ-plugins-461)
SHALL start without the owner's cloud credentials (SAFE-21.b, captured in
this change's PR from Leif's 2026-09-28 interview, round 16): `runnerChildEnv`
(`plugins/runners/commands.ts`) and `fledgeCoreChildEnv`
(`plugins/fledge/core.ts`) SHALL apply `withoutCloudCredentials`
(`src/agent/verify.ts`, REQ-agent-621) after the verify-lane scrub and the
SAFE-21.a git / GitHub scrub (REQ-plugins-495, unchanged): every
`isCloudCredentialEnvKey` key dropped, `KUBECONFIG`,
`AWS_SHARED_CREDENTIALS_FILE`, `AWS_CONFIG_FILE` and
`GOOGLE_APPLICATION_CREDENTIALS` = `/dev/null`,
`AWS_EC2_METADATA_DISABLED=true`, and `CLOUDSDK_CONFIG` / `AZURE_CONFIG_DIR`
fresh empty dirs made for that one child. `runRunner`, the `shell-exec`
handler and the Fledge core spawn SHALL call `releaseCloudStandIns` on that
env once the child has exited (also after a timeout, an abort or a spawn
error), so those dirs are removed. Every other key the child got before is
kept. Fledge plugin commands (`fledge-<command>`, `fledgeChildEnv`) are
unchanged. No new slash command, env var or config key.

Acceptance Criteria
- With the owner's cloud env set, and separately with only the owner's default
  files under a fake HOME (`~/.kube/config`, `~/.aws/credentials` /
  `config`, `~/.config/gcloud/*` with the ADC file, `~/.azure/*`),
  `shell-exec` running stand-in `kubectl` / `aws` / `gcloud` / `az` by
  absolute path, each of `node-exec` / `python-exec` / `cargo-exec`
  (`runRunner` with a stand-in binary) and `fledge-lanes-run verify` /
  `fledge-run deploy` (a stand-in fledge) show no cloud key, value or file
  content; `KUBECONFIG`, `AWS_SHARED_CREDENTIALS_FILE`, `AWS_CONFIG_FILE` and
  `GOOGLE_APPLICATION_CREDENTIALS` are `/dev/null`,
  `AWS_EC2_METADATA_DISABLED=true`, `CLOUDSDK_CONFIG` / `AZURE_CONFIG_DIR`
  lie outside HOME and are gone after the call; `AWS_REGION`,
  `GOOGLE_CLOUD_PROJECT` and other keys stay (`tests/agent.cloud-credentials.test.ts`).
- A runner child that writes a login into its gcloud and az config dirs does
  not reach the next runner child.
- The SAFE-21.a git / GitHub scrub and its tests (`tests/runners.plugins.test.ts`,
  `tests/shell.footguns.test.ts`, `tests/fledge.core.test.ts`) are unchanged.
