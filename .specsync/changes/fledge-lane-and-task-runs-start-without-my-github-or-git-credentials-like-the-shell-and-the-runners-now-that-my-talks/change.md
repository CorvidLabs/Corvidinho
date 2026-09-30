---
id: fledge-lane-and-task-runs-start-without-my-github-or-git-credentials-like-the-shell-and-the-runners-now-that-my-talks
state: approved
type: bug_fix
base_commit: 749cb55d58c8c3c119d4368359c398cab8677d9f
---

# Fledge lane and task runs start without my GitHub or git credentials, like the shell and the runners, now that my talks may be offered them (SAFE-21.a, SAFE-3.a)

## Intent

Fledge lane and task runs start without my GitHub or git credentials, like the shell and the runners, now that my talks may be offered them (SAFE-21.a, SAFE-3.a)

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- fledge-lanes-run and fledge-run (and the two Fledge core reads) start fledge with the env shell-exec and the language runners get (withoutGitCredentials over the verify-lane scrub): no GH_TOKEN, GITHUB_TOKEN, GIT_ASKPASS, SSH_AUTH_SOCK or inherited GH_CONFIG_DIR; GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_NOSYSTEM=1, GIT_TERMINAL_PROMPT=0, GIT_CONFIG_COUNT=3 with an empty credential.helper, a key-less GIT_SSH_COMMAND and an empty GH_CONFIG_DIR, so the owner's credential helper and gh login never reach a lane or task; FLEDGE_NON_INTERACTIVE=1, CORVIDINHO_PROJECT_ROOT and the verify-lane scrub are unchanged

## No-spec Rationale

Not applicable
