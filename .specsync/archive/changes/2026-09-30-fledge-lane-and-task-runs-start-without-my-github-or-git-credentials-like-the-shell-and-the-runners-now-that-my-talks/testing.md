---
change: fledge-lane-and-task-runs-start-without-my-github-or-git-credentials-like-the-shell-and-the-runners-now-that-my-talks
artifact: testing
---

# Testing

- `tests/fledge.core.test.ts` › "lane and task runs start without GitHub or
  git credentials, like shell-exec and the runners (SAFE-21.a, SAFE-3.a)":
  a fake `fledge` records the env; with `GH_TOKEN`, `GIT_ASKPASS`,
  `SSH_AUTH_SOCK`, a `GH_CONFIG_DIR` holding `hosts.yml` and a
  `~/.gitconfig` credential helper, both `fledge-run` and `fledge-lanes-run`
  start fledge with none of them, `GIT_CONFIG_GLOBAL=/dev/null`,
  `GIT_CONFIG_NOSYSTEM=1`, `GIT_TERMINAL_PROMPT=0`, `GIT_CONFIG_COUNT=3`
  with an empty `credential.helper`, a key-less `GIT_SSH_COMMAND`, no
  `hosts.yml`, and the verify-lane scrub unchanged.
- Fail on base: with the base's `plugins/fledge/core.ts` the test fails
  (`askpass=set sshsock=set`, `hosts=yes`, `helpers=[owner-marker-helper,]`).
- The rest of `tests/fledge.*.test.ts` and `tests/runners.plugins.test.ts` pass.
