---
module: agent
change: on-github-the-owner-and-team-i-ve-declared-get-their-role-s-tools-behind-the-must-ask-gate-strangers-stay-community
---

# Delta: agent (no discovered Fledge plugin command in a WATCH run, even the owner's — IDENTITY-12.a)

## Added

### REQUIREMENT REQ-agent-1201

The owner's own GitHub run (IDENTITY-12.a, #65; REQ-watch-1201,
REQ-plugins-1201). A WATCH run whose trigger is the owner now carries the
owner stamp and gets the owner's tools per the run's allowlist, but SAFE-3.a
still keeps runs of project code off WATCH: `createTaskExecute` SHALL NOT call
`loadFledgePlugins` in a WATCH run — `isWatchRunEnv(env)` (the surface stamp
is `watch`) or `CORVIDINHO_WATCH_SESSION_ID` set — whatever its role, as it
already does not in a scheduled run (REQ-agent-741; the `includeDangerous`
test seam aside). The shell, runners and Fledge core runs stay refused there by
the SAFE-3.a gate (REQ-agent-503), and the owner's other allowlisted
dangerous tools stay offered. No env var, config key, flag or schema change.

Acceptance Criteria
- An env stamped as the WATCH spawn stamps a run the owner's own comment triggered (surface `watch`, a WATCH session id, the owner stamp, the owner's `[owner] github_id` as `CORVIDINHO_ACTING_GITHUB_ID`) with `fledge-hello`, `github-pr-review`, `files-delete` and `shell-exec` allowlisted: `github-pr-review` and `files-delete` are offered, `shell-exec` is not, only the Fledge core reads are, `fledge-hello` is never registered or spawned, and a call to it is refused as not offered (`tests/agent.allowlisted-dangerous.test.ts`).
- With the base `src/agent/execute.ts` that test fails (fledge-hello is discovered); it passes on the branch.
