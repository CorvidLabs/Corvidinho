---
change: security-gate-tests-fail-when-the-gate-is-removed-safe-2-refuses-every-specs-path-github-deny-users-and-deny-orgs-win
artifact: research
---

# Research

- Source: `/home/user/coord/qa-audit.json` findings `safe2-specs-dir-untested`,
  `github-deny-users-orgs-untested`, `roles-chat8-private-repo-live-untested`,
  `discord8-live-check-untested` (kinds missing-test / weak-test), each with a
  mutation that left the full suite green.
- Octokit 22 (`@octokit/request`) resolves `globalThis.fetch` per request
  (`requestOptions.request?.fetch || globalThis.fetch`), so a per-test fetch
  stub drives `createOctokitVisibilityLookup` with no network.
- discord.js 14: `verifyRequesterCanSend` waits for `ready` after
  `client.login`; replacing `Client.prototype.login` lets a test set
  `channels.fetch` on the instance and emit `ready` (same seam as
  `tests/discord.presence.test.ts`). `client.destroy()` still runs in the
  function's `finally`.
- `git-push` gates through `checkRepoGate` → `checkGithubRepo` →
  `isRepoAllowed`; `checkRepoGateForActingRole` has its own org-deny copy, so
  only the plugin path proves `isRepoAllowed`'s `deny_orgs` loop.
