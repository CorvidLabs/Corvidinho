---
change: fledge-lane-and-task-runs-start-without-my-github-or-git-credentials-like-the-shell-and-the-runners-now-that-my-talks
artifact: tasks
---

# Tasks

- [x] `fledgeCoreChildEnv` → `withoutGitCredentials(buildVerifyEnv(base))`, then CDPATH / OLDPWD dropped, `FLEDGE_NON_INTERACTIVE=1`, `CORVIDINHO_PROJECT_ROOT`.
- [x] Regression test in `tests/fledge.core.test.ts` ("lane and task runs start without GitHub or git credentials, like shell-exec and the runners (SAFE-21.a, SAFE-3.a)").
- [x] Fail-on-base proof (old `core.ts`: askpass, ssh agent, gh `hosts.yml` and the owner's helper reach fledge; the test fails).
- [x] REQ-plugins-461 delta, plugins spec prose, testing evidence.
