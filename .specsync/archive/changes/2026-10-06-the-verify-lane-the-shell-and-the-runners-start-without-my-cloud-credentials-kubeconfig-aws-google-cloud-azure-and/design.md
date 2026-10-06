---
change: the-verify-lane-the-shell-and-the-runners-start-without-my-cloud-credentials-kubeconfig-aws-google-cloud-azure-and
artifact: design
---

# Design

## One cloud scrub, next to the verify lane's

`src/agent/verify.ts` gains `isCloudCredentialEnvKey` (an explicit, commented
key set plus four documented patterns: `AWS_CONTAINER_*`, `CLOUDSDK_*`, any
`AWS_` / `GOOGLE_` / `GCLOUD_` / `GCP_` / `AZURE_` / `ARM_` key naming a key,
token, secret, password or credential, and `TF_TOKEN_*`),
`CLOUD_CREDENTIAL_STAND_INS`, `withoutCloudCredentials(env)` and
`releaseCloudStandIns(env)`. `buildVerifyEnv` / `isVerifyEnvDropped` are left
as they are, so the SAFE-21 secret-read refusal (`$NAME` reads of
verify-dropped keys) and every existing caller keep their behaviour; the cloud
scrub is applied where a child is spawned.

## Default files: stand-ins, not just a dropped env

Dropping `KUBECONFIG` would make kubectl read `~/.kube/config`. So the child
gets `KUBECONFIG`, `AWS_SHARED_CREDENTIALS_FILE`, `AWS_CONFIG_FILE` and
`GOOGLE_APPLICATION_CREDENTIALS` = `/dev/null` (an empty file to every tool;
nothing written there persists; the ADC path is set because Node and Go Google
clients read `~/.config/gcloud/application_default_credentials.json` whatever
`CLOUDSDK_CONFIG` says, and with the env pointing at `/dev/null` they fail
closed instead of falling back), plus `AWS_EC2_METADATA_DISABLED=true` (no
EC2 instance-role credentials). gcloud and az write state into their config
dirs on every run, so `/dev/null` does not work there: `CLOUDSDK_CONFIG` and
`AZURE_CONFIG_DIR` point at `gcloud/` and `azure/` inside one
`mkdtemp` `corvidinho-no-cloud-*` dir (0700) made per child, so nothing one
child writes (a login, a token) reaches the next.

## Lifetime of the stand-in dirs

`withoutCloudCredentials` records the dir in a module set and registers one
process `exit` hook. The spawn sites release it once the child has exited:
`defaultVerifyRunner` (in its `finally`, and when `Bun.spawn` throws),
`runRunner`, the `shell-exec` handler and the Fledge core `spawnFledge` (a
`try/finally` around `spawnCapped`). `releaseCloudStandIns` removes only a dir
it recorded, so an env that names the owner's own `~/.config/gcloud` is never
deleted. An env built and never spawned (a test calling `runnerChildEnv`)
keeps its empty dir until the process exits.

## Order

`withoutCloudCredentials(withoutGitCredentials(buildVerifyEnv(base)))` in
`runnerChildEnv` and `fledgeCoreChildEnv`; the two key families do not
overlap, so the SAFE-21.a env is unchanged.
