---
change: the-specsync-check-tool-the-verify-lane-s-spec-check-step-starts-without-my-cloud-credentials-and-its-output-is
artifact: testing
---

# Testing

`tests/agent.cloud-credentials.test.ts` — new describe "SAFE-21.b:
specsync-check, the verify lane's spec-check step, starts without cloud
credentials (REQ-plugins-621)": a child bun process started with the owner's
env (cloud env set, and separately only the default files under a fake HOME;
plus a `GITHUB_TOKEN` with no vendor shape) runs the `specsync-check` handler
twice per scenario: with a `fledge.toml` `[tasks.spec-check]` and a stand-in
`fledge` first on PATH (`fledge run spec-check`), and with no such task and a
stand-in `specsync` (`specsync check`). Each stand-in runs the stand-in
`kubectl` / `aws` / `gcloud` / `az` and dumps its env. Asserted: no marker, no
dropped key, the four file stand-ins `/dev/null`, `AWS_EC2_METADATA_DISABLED=true`,
`CLOUDSDK_CONFIG` / `AZURE_CONFIG_DIR` outside HOME and gone after the call,
`AWS_REGION` / `GOOGLE_CLOUD_PROJECT` / `KEEP_ME` kept, and the GitHub token
value absent from the tool's output.

Fail-on-main: with main's (`86d68cd0`) `plugins/specsync/api.ts` swapped in,
the file gave 7 pass, 1 fail (the new test: the owner's AWS / kube / gcloud /
azure markers and `GITHUB_TOKEN=…` came back in the tool's output); restored,
8 of 8 pass.

Gates: `specsync change check --commit`, `specsync change audit`,
`specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`,
`bun test` (twice), `fledge lanes run verify --non-interactive`.
