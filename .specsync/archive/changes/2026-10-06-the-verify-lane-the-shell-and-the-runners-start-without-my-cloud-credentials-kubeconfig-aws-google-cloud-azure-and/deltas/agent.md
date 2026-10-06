---
module: agent
change: the-verify-lane-the-shell-and-the-runners-start-without-my-cloud-credentials-kubeconfig-aws-google-cloud-azure-and
---

# Delta: agent (the verify lane starts without the owner's cloud credentials; the shared cloud scrub — SAFE-21.b)

## Added

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
  exits (REQ-agent-002); `shell-exec`, the language runners and the Fledge
  core runs use the same scrub (REQ-plugins-621).
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

## Modified

### REQUIREMENT REQ-agent-002

When the run changed files (in the run's real git working-tree diff per REQ-agent-085, or, with no git snapshot, reported by a tool) or a tool claimed a change git does not show, completion SHALL run `fledge lanes run verify --non-interactive`; there is no switch that skips it (AGENT-14, REQ-agent-003). Pass → `verified=true` only when the lane's output also shows that tests ran and no test was deleted or turned off since the baseline (AGENT-15, REQ-agent-185); a passing lane without that evidence is a failed verify like any other, whose note leads the retry's feedback. Fail with retries remaining → re-enter executing with verifier output. Exhausted retries → terminal failure with `verified=false` (AGENT-4 / AGENT-4.a / FLEDGE-2). The default runner SHALL spawn fledge with the parent's env minus the delegate worker drop list (`DISCORD_*`, `GITHUB_TOKEN`, `GH_TOKEN`, `CORVIDINHO_AUDIT_HMAC_KEY`, `BRAVE_SEARCH_API_KEY`, `GIPHY_API_KEY` and every `CORVIDINHO_ACTING_*` key) and the LLM API keys (`CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`), and without the owner's cloud credentials (SAFE-21.b, REQ-agent-621: `withoutCloudCredentials` drops every `isCloudCredentialEnvKey` key and sets the empty stand-ins, its config dirs removed once the lane exits), keeping every other inherited key, so tests the agent wrote never see operator secrets (SAFE-6) or reach prod by accident. The verifier output a retry gets SHALL be the failing step's, not the start of the lane log (AGENT-4.a): output within `VERIFY_FEEDBACK_MAX_CHARS` (4000) is passed whole; over it, `verifyFeedbackExcerpt` SHALL drop colour escapes, name the failing step (from fledge's `Lane '<lane>' failed at step N (<name>)` line; a parallel step is `parallel(<tasks>)`) and keep that step's output from its `Running task: <name>` marker (a parallel step's from its `Running parallel:` line) when it fits, else its error / fail lines (lines that report a failure, such as `error:`, `Expected:`, `(fail)` or `file(1,2): error TS…`, before lines that only mention one; first ones first; passing-test lines left out; printed in log order) and the end of the log, in at most 4000 chars and never cut inside a surrogate pair. `runTask` SHALL keep the feedback it passes as `ExecuteContext.verifyFeedback` (its "Verification failed" head included) within that cap, and the LLM execute (tool loop and read-tier chat) SHALL cap verify feedback with the same excerpt, never by keeping its first 4000 chars. No flag, environment variable or config key is added.

Acceptance Criteria
- Mock verify fail then pass within max_retries yields `verified=true` and a second execute call that receives feedback.
- Exhausted retries yield `verified=false` and failed state.
- Default runner invokes fledge with `lanes run verify --non-interactive`.
- An attempt whose execute result reports no files but that changed the git working tree (REQ-agent-085) runs verify: done with `verified=true` only on a pass, otherwise retried and then failed.
- A process with `DISCORD_TOKEN`, `DISCORD_BOT_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `CORVIDINHO_LLM_API_KEY`, `CORVIDINHO_AUDIT_HMAC_KEY` and `CORVIDINHO_ACTING_*` set runs the default runner (and `BRAVE_SEARCH_API_KEY` and `GIPHY_API_KEY` are dropped by `isVerifyEnvDropped` / `buildVerifyEnv`, `tests/web.search.test.ts`, `tests/gif.search.test.ts`): the fledge child's env has none of those keys or values and keeps the rest (PATH, HOME, `CORVIDINHO_DATA_DIR`, other keys).
- A failing lane log whose passing steps (lint, a `--help` smoke over 4000 chars) come before a failing `test` step gives the retry's `verifyFeedback` and the tool loop's next request at most 4000 chars that name `Failing step: test (step 3 of lane 'verify')` and carry the failing test's error lines and fledge's failure line, not the `--help` text (AGENT-4.a).
- A failing step whose own output is over the cap keeps its first error lines and the end of the log (the last failure, the test summary, fledge's failure line); passing-test lines are not kept as error lines.
- A raw verify feedback over the cap passed to the read-tier chat is cut to the failing step and the end of the log, not its first 4000 chars.
- Verify output within the cap reaches the retry and the model whole, as before.
- The excerpt is never longer than its cap and never holds half a surrogate pair.
- Console chatter in the failing step that only mentions a failure (`… marked failed`, `error_class=ok`, as Corvidinho's own tests log on stdout before bun's stderr report) does not crowd out that step's `error:`, `Expected:` / `Received:` and `(fail)` lines.
- Colour escapes (FORCE_COLOR reaching the lane) are dropped from an over-cap log and hide neither fledge's markers nor passing-test lines; a failing parallel step is named `parallel(<tasks>)` and kept from its `Running parallel:` line; a log with no fledge markers is not called a failing step's output.
- An `error:` line with emoji that the end of the error-line scan (where the kept end of the log starts) cuts between a high and a low surrogate is not kept on its high half: with the noise after it swept so the cut falls inside the emoji, the excerpt at 4000 and at runTask's 3946 cap still names the failing step and holds no lone surrogate.
- A run that changed files is verified with no option set; `RunTaskOptions` has no field that skips the gate.
- A passing lane whose output has no recognised test summary, or whose tests were all skipped, is not verified: the attempt is retried with the `Verify gate: not verified: …` note first in its feedback, then ends `failed` (REQ-agent-185).
- A stub lane that passes and prints a `bun test` summary (`tests/fixtures/lane-output.ts`) ends `done` verified as before.
- With the owner's cloud env set (KUBECONFIG, AWS keys / profile / role, Google ADC and `CLOUDSDK_*`, Azure / ARM, other clouds' tokens), or only their default files under HOME, the default runner's fledge child has none of those keys or files' contents: `KUBECONFIG`, `AWS_SHARED_CREDENTIALS_FILE`, `AWS_CONFIG_FILE` and `GOOGLE_APPLICATION_CREDENTIALS` are `/dev/null`, `AWS_EC2_METADATA_DISABLED=true`, `CLOUDSDK_CONFIG` / `AZURE_CONFIG_DIR` are outside HOME and gone after the lane, and `AWS_REGION` / `GOOGLE_CLOUD_PROJECT` stay (`tests/agent.cloud-credentials.test.ts`, SAFE-21.b).
