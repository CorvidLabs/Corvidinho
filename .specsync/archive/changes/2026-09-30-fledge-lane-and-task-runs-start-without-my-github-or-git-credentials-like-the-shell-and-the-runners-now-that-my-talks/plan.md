---
change: fledge-lane-and-task-runs-start-without-my-github-or-git-credentials-like-the-shell-and-the-runners-now-that-my-talks
artifact: plan
---

# Plan

1. `plugins/fledge/core.ts`: `fledgeCoreChildEnv` wraps `buildVerifyEnv` in `withoutGitCredentials` (plugins/runners/commands.ts).
2. `tests/fledge.core.test.ts`: the fake fledge records the credential keys and `git config --get-all credential.helper`; a new test runs `fledge-run` and `fledge-lanes-run` with the owner's credentials in env and home.
3. Fail-on-base: restore the old `core.ts`, the new test fails; restore.
4. Spec: REQ-plugins-461 delta, plugins spec prose, testing evidence; docs row in DISCORD-GO-LIVE (the SAFE-3.a change's path).
