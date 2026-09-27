---
change: roles-chat-7-b-an-admin-role-session-s-github-pr-create-is-tested-safe-1-denies-it-without-an-allowlist-entry-github-6
artifact: context
---

# Context

ROLES-CHAT-7 (`hi/roles.md`, captured): "Prove-before-done: automated tests
cover (a) non-admin cannot run file-write / shell / github-create-pr /
memory-forget, (b) admin can reach those paths still gated by SAFE, (c)
channel allowlist still required."

On main (`fbaa84b`), `tests/roles.chat.gates.test.ts` covers (b) only for
`files-write` and `shell-exec` under `asAdmin()`. `github-pr-create`
appears there only in the non-ADMIN (a) refusals. The only other test that
sets `CORVIDINHO_ACTING_IS_ADMIN` and runs `github-pr-create`
(`tests/github.gate-allowlist-file.test.ts`) sets it to `0` (community).
`tests/github.write.plugin.test.ts` runs `github-pr-create` with no role
session at all. So nothing proves that an ADMIN role session reaches
`github-pr-create` and is still SAFE-1 and GITHUB-6 gated there.

Proof of the gap: three mutations of the product code, each run against the
full main suite (1839 pass, 0 fail every time) and against the new test
(fails every time):

- M1: `runPlugin` skips the SAFE-1 non-interactive deny for ADMIN
  `github-*` calls.
- M2: `checkRepoGateForActingRole` returns ok for ADMIN before the GITHUB-6
  repo allowlist check.
- M3: the ROLES-CHAT role gate refuses ADMIN for `github-*` calls (ADMIN can
  no longer reach the path).

Scope: test only. The gates already behave as ROLES-CHAT-7(b) asks; no product
code changes. The test is dry-run only (`CORVIDINHO_GITHUB_DRY_RUN=1`) and the
file's per-test env snapshot now also clears and restores the GitHub allow/deny
keys, `CORVIDINHO_GITHUB_DRY_RUN`, `GITHUB_TOKEN` and `GH_TOKEN`, so an
operator's env can neither admit the repo nor reach the network.

Out of scope: ADMIN `memory-forget` under ROLES-CHAT-7(b) (MEMORY-ACL confirm
path) is a separate slice. Open PRs #232 and #233 are not touched.
