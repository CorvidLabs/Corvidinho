---
id: the-specsync-check-tool-the-verify-lane-s-spec-check-step-starts-without-my-cloud-credentials-and-its-output-is
state: accepted
type: bug_fix
base_commit: 86d68cd0d65e1836475d5e37a49444bdd0177ecb
---

# The specsync-check tool (the verify lane's spec-check step) starts without my cloud credentials and its output is scrubbed (SAFE-21.b follow-up to #373)

## Intent

The specsync-check tool (the verify lane's spec-check step) starts without my cloud credentials and its output is scrubbed (SAFE-21.b follow-up to #373)

## Affected Canonical Specs

- `plugins`
- `agent`

## Acceptance Criteria

- SAFE-21.b (hi/safe.md, captured on main): the tier-0 specsync-check tool, which runs the verify lane's spec-check step (the project's Fledge spec-check task, else plain specsync check), starts without the owner's cloud credentials. runSpecCheck spawns fledge run spec-check with withoutCloudCredentials(buildVerifyEnv()), the verify lane's env, and spawnSpecsync spawns specsync with withoutCloudCredentials of process.env at call time; both release the stand-in config dirs once the child exits and pass the output through scrubSecrets(redactSecretEnvValues(...)). Regression test in tests/agent.cloud-credentials.test.ts: with the owner's cloud env set, and separately with only the default files under a fake HOME, specsync-check via a stand-in fledge and a fledge.toml spec-check task, and via a stand-in specsync with no such task, shows no cloud key, value or file content, the stand-ins at /dev/null and empty dirs gone after the call, AWS_REGION and GOOGLE_CLOUD_PROJECT kept, and the owner's GITHUB_TOKEN value never in the output; the test fails on main's plugins/specsync/api.ts and passes on the branch.

## No-spec Rationale

Not applicable
