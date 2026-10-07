---
module: agent
change: the-specsync-check-tool-the-verify-lane-s-spec-check-step-starts-without-my-cloud-credentials-and-its-output-is
---

# Delta: agent (the verify lane's spec-check step, run as the specsync-check tool, uses the same cloud scrub — SAFE-21.b follow-up to #373)

## Modified

### REQUIREMENT REQ-agent-621

The verify lane, the shell and the runners start without the owner's cloud
credentials (KUBECONFIG, AWS, Google Cloud, Azure and similar), so they can't
reach prod by accident (SAFE-21.b, captured in this change's PR from Leif's
2026-09-28 interview, round 16 on 2026-10-06). `src/agent/verify.ts` holds the
one cloud scrub every such child uses:

- `isCloudCredentialEnvKey(key)` SHALL be true for the documented family:
  `KUBECONFIG`, `KUBERNETES_SERVICE_HOST`, `KUBERNETES_SERVICE_PORT`;
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`,
  `AWS_SECURITY_TOKEN`, `AWS_PROFILE`, `AWS_DEFAULT_PROFILE`,
  `AWS_SHARED_CREDENTIALS_FILE`, `AWS_CONFIG_FILE`, `AWS_ROLE_ARN`,
  `AWS_ROLE_SESSION_NAME`, `AWS_WEB_IDENTITY_TOKEN_FILE`, every
  `AWS_CONTAINER_*`; `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CREDENTIALS`,
  `GOOGLE_CLOUD_KEYFILE_JSON`, `GCLOUD_KEYFILE_JSON`,
  `GOOGLE_OAUTH_ACCESS_TOKEN`, `GOOGLE_IMPERSONATE_SERVICE_ACCOUNT`,
  `GOOGLE_GHA_CREDS_PATH`, every `CLOUDSDK_*`; `AZURE_CLIENT_ID`,
  `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`,
  `AZURE_USERNAME`, `AZURE_PASSWORD`, `AZURE_CLIENT_CERTIFICATE_PATH`,
  `AZURE_CLIENT_CERTIFICATE_PASSWORD`, `AZURE_FEDERATED_TOKEN_FILE`,
  `AZURE_CONFIG_DIR`, `AZURE_STORAGE_KEY`, `AZURE_STORAGE_CONNECTION_STRING`,
  `AZURE_STORAGE_SAS_TOKEN`, `AZURE_DEVOPS_EXT_PAT`, `IDENTITY_ENDPOINT`,
  `IDENTITY_HEADER`, `MSI_ENDPOINT`, `MSI_SECRET`, and the `ARM_*` client,
  tenant, subscription, access key, SAS token, certificate, OIDC and MSI keys;
  any `AWS_` / `GOOGLE_` / `GCLOUD_` / `GCP_` / `AZURE_` / `ARM_` key whose
  name holds `ACCESS_KEY`, `API_KEY`, `TOKEN`, `SECRET`, `PASSWORD`,
  `CREDENTIAL`, `KEYFILE` or `CONNECTION_STRING`; every `TF_TOKEN_*`; and
  `DIGITALOCEAN_TOKEN`, `DIGITALOCEAN_ACCESS_TOKEN`, `HCLOUD_TOKEN`,
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_API_KEY`, `LINODE_TOKEN`,
  `LINODE_CLI_TOKEN`, `VULTR_API_KEY`, `SCW_ACCESS_KEY`, `SCW_SECRET_KEY`,
  `OCI_CLI_CONFIG_FILE`, `OCI_CLI_KEY_FILE`, `OCI_CLI_PROFILE`,
  `OCI_CLI_AUTH`, `IBMCLOUD_API_KEY`, `IC_API_KEY`,
  `ALIBABA_CLOUD_ACCESS_KEY_ID`, `ALIBABA_CLOUD_ACCESS_KEY_SECRET`,
  `ALICLOUD_ACCESS_KEY`, `ALICLOUD_SECRET_KEY`, `OS_PASSWORD`, `OS_TOKEN`,
  `OS_APPLICATION_CREDENTIAL_SECRET`, `HEROKU_API_KEY`, `FLY_API_TOKEN`,
  `FLY_ACCESS_TOKEN`, `VERCEL_TOKEN`, `NETLIFY_AUTH_TOKEN`, `RAILWAY_TOKEN`,
  `TFE_TOKEN`, `PULUMI_ACCESS_TOKEN`, `VAULT_TOKEN`, `NOMAD_TOKEN`,
  `CONSUL_HTTP_TOKEN`. Ordinary settings (`AWS_REGION`, `AWS_DEFAULT_REGION`,
  `AWS_ENDPOINT_URL`, `GOOGLE_CLOUD_PROJECT`, `GCLOUD_PROJECT`,
  `AZURE_LOCATION`, …) SHALL NOT be in it.
- `withoutCloudCredentials(env)` SHALL drop those keys in place, then set the
  empty stand-ins `CLOUD_CREDENTIAL_STAND_INS` — `KUBECONFIG`,
  `AWS_SHARED_CREDENTIALS_FILE`, `AWS_CONFIG_FILE` and
  `GOOGLE_APPLICATION_CREDENTIALS` = `/dev/null` (not `~/.kube/config`,
  `~/.aws/credentials` / `~/.aws/config` or the ADC well-known file under
  `~/.config/gcloud`) and `AWS_EC2_METADATA_DISABLED=true` — and point
  `CLOUDSDK_CONFIG` (not `~/.config/gcloud`) and `AZURE_CONFIG_DIR` (not
  `~/.azure`) at fresh, empty 0700 dirs inside one private
  `corvidinho-no-cloud-*` temp dir made for that one child, so a login or token
  one child writes there never reaches the next.
- `releaseCloudStandIns(env)` SHALL remove that temp dir once the child has
  exited, and SHALL be a no-op for an env `withoutCloudCredentials` did not
  build or one already released (it never removes a dir the env merely names);
  dirs still there when the process exits are removed then.
- `defaultVerifyRunner` (runTask's lane) SHALL spawn fledge with
  `withoutCloudCredentials(buildVerifyEnv())` and release it after the lane
  exits (REQ-agent-002); `shell-exec`, the language runners, the Fledge
  core runs and the `specsync-check` tool (the lane's `spec-check` step,
  `runSpecCheck` / `spawnSpecsync` in `plugins/specsync/api.ts`) use the same
  scrub (REQ-plugins-621).
- Fledge plugin commands (`fledge-<command>`, `fledgeChildEnv`) and
  `delegate` / `council` workers (`isWorkerEnvDropped`) are unchanged; the
  workers' own verify lane, shell and runners scrub as above. No new env var,
  config key, slash command, table or schema version.

Acceptance Criteria
- With the owner's cloud env set (a two-entry KUBECONFIG, the in-cluster host,
  AWS keys / session token / profile / role / web identity / container
  endpoint / Bedrock token, Google ADC / credentials / OAuth / API key,
  `CLOUDSDK_CONFIG` / account / token file, `AZURE_CONFIG_DIR`, Azure / ARM
  secrets, managed identity, DigitalOcean, Hetzner, Cloudflare, Vault,
  `TF_TOKEN_*`) and, separately, with only the owner's default files under
  HOME, stand-in `kubectl` / `aws` / `gcloud` / `az` run by the default verify
  runner's fledge see no cloud key or value and none of those files: the
  stand-ins read `/dev/null` and empty dirs outside HOME, gone once the lane
  exits; `AWS_REGION`, `GOOGLE_CLOUD_PROJECT` and other keys are kept.
- `isCloudCredentialEnvKey` is true for every documented key and pattern and
  false for `PATH`, `HOME`, `TMPDIR`, `AWS_REGION`, `AWS_DEFAULT_REGION`,
  `AWS_ENDPOINT_URL`, `GOOGLE_CLOUD_PROJECT`, `GCLOUD_PROJECT`,
  `AZURE_LOCATION`, `KUBE_EDITOR`, `OSTYPE`, `TF_LOG`.
- Two `withoutCloudCredentials` calls give different, empty, 0700 dirs;
  `releaseCloudStandIns` removes only its own (twice is a no-op), and an env
  naming the owner's `~/.config/gcloud` / `~/.azure` leaves them in place.
- The `specsync-check` tool, which runs the verify lane's `spec-check` step,
  uses the same scrub: its `fledge run spec-check` child gets
  `withoutCloudCredentials(buildVerifyEnv())` and its `specsync check` child
  `withoutCloudCredentials` of the current env, released after the child, and
  its output is secret-scrubbed; with the owner's cloud env or default files
  it shows none of them (`tests/agent.cloud-credentials.test.ts`,
  REQ-plugins-621).
