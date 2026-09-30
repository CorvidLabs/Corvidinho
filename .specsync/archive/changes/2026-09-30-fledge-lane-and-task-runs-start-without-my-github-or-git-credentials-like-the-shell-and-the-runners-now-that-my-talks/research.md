---
change: fledge-lane-and-task-runs-start-without-my-github-or-git-credentials-like-the-shell-and-the-runners-now-that-my-talks
artifact: research
---

# Research

- `plugins/fledge/core.ts` `fledgeCoreChildEnv` (main 507d97b): `buildVerifyEnv`
  minus CDPATH / OLDPWD only.
- `plugins/runners/commands.ts` `withoutGitCredentials` / `runnerChildEnv`
  (#309, REQ-plugins-495): the SAFE-21.a env for `shell-exec` and the runners.
- CHANGELOG #309 residual: "`fledge-lanes-run` / `fledge-run`, which keep the
  verify env" — recorded while the runs were never offered to the model.
