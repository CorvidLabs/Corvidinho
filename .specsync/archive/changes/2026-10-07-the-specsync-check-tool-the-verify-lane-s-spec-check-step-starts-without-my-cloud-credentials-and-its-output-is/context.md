---
change: the-specsync-check-tool-the-verify-lane-s-spec-check-step-starts-without-my-cloud-credentials-and-its-output-is
artifact: context
---

# Context

Follow-up to #373 (SAFE-21.b: the verify lane, shell and runners start without
my cloud credentials). A post-merge review found one surface #373 missed: the
tier-0 `specsync-check` tool runs the verify lane's `spec-check` step
(`fledge run spec-check`, else `specsync check`) through `runSpecCheck` /
`spawnSpecsync` in `plugins/specsync/api.ts`, which spawned with no `env`; the
CLI's spawn shim (`src/cli.ts`, CLI-5) then fills in all of `process.env`, so
the child got every cloud credential. `specsync-check` is `dangerous: false`,
`minTier: 0`, so every role at tool tier and above reaches it (chat, WATCH,
schedules, delegate workers, `corvidinho specsync check`), and its output
skipped the SAFE-6 scrub. Reproduced on main: a project whose spec-check task
echoes `$AWS_SECRET_ACCESS_KEY` / `$KUBECONFIG` and cats `~/.aws/credentials`
returned the owner's values through the tool, while `fledge-run spec-check`
scrubbed them.

Criterion: SAFE-21.b (`hi/safe.md`, captured on main). No new hi capture.
