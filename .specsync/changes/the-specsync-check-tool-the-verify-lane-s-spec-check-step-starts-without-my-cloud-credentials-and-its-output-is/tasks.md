---
change: the-specsync-check-tool-the-verify-lane-s-spec-check-step-starts-without-my-cloud-credentials-and-its-output-is
artifact: tasks
---

# Tasks

- [x] `plugins/specsync/api.ts`: `runSpecCheck` and `spawnSpecsync` spawn without cloud credentials, release the stand-ins, scrub the output.
- [x] Test: `tests/agent.cloud-credentials.test.ts` covers `specsync-check` through a stand-in fledge (with a `spec-check` task) and a stand-in specsync (without), both scenarios; fail-on-main proof in testing.md.
- [x] Spec prose (plugins, agent), module testing evidence, deltas (REQ-plugins-621, REQ-agent-621 modified).
- [x] `specsync change approve`, `change check --commit`, `change audit`, `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
