# Lesson bundle — roles-chat-7-b-an-admin-role-session-s-github-pr-create-is-tested-safe-1-denies-it-without-an-allowlist-entry-github-6

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: ROLES-CHAT-7(b): an ADMIN role session's github-pr-create is tested: SAFE-1 denies it without an allowlist entry, GITHUB-6 still refuses an unlisted repo, and the dry-run PR goes through with the allowlist entry plus the GITHUB-6 repo allowlist
- **Kind**: BugFix
- **Specs**: agent
- **Paths**: tests/roles.chat.gates.test.ts
- **Acceptance**: In tests/roles.chat.gates.test.ts, an ADMIN role session (CORVIDINHO_ACTING_IS_ADMIN=1, acting user = configured owner) running github-pr-create non-interactively is refused with exit 2 and a SAFE-1 error (not the role refusal) when the allowlist has no github-pr-create entry; with the entry but an empty GITHUB-6 repo allowlist it is refused with exit 3 and a GITHUB-6 error; with the entry plus CORVIDINHO_GITHUB_ALLOW_REPOS=CorvidLabs/Corvidinho the dry-run PR returns ok with dryRun true and the given owner, repo, title, head and base. The test fails if SAFE-1 or the GITHUB-6 repo gate is skipped for ADMIN github writes, or if the role gate refuses ADMIN; main's suite catches none of these.

## Evidence

- Verification commit: `6752c9dd2a96abc56ceb1ac5df703c1683853b51`
- Base commit: `fbaa84b7cda1bf2b462baea44cad20ef93e0df4f`
- Verified by: `specsync check --spec agent --spec plugins`

## From the change's context.md

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

The other ROLES-CHAT-7(b) paths are already covered on main: `files-write`
and `shell-exec` in this file, and ADMIN `memory-forget` in
`tests/memory.plugins.test.ts` ("dangerous forget/override still SAFE-1 denied
without allowlist" runs as the owner with the bridge bit; "admin user/role
lists no longer grant memory ADMIN" shows the owner's allowlisted forget goes
through). Open PRs #232 and #233 are not touched.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-165` | `tests/roles.chat.gates.test.ts` | "(b) admin github-pr-create: SAFE-1 denies without an allowlist entry; dry-run ok with the allowlist + GITHUB-6 repo allowlist": ADMIN confirmed by `resolveActingIsAdmin()`; empty allowlist → exit 2, `SAFE-1`, no role refusal; allowlisted with no repo allowlist → exit 3, `GITHUB-6`; allowlisted + `CORVIDINHO_GITHUB_ALLOW_REPOS=CorvidLabs/Corvidinho` → ok, `dryRun: true` with the given owner/repo/title/head/base. Fails under M1 (SAFE-1 skipped for ADMIN `github-*`), M2 (GITHUB-6 skipped for ADMIN) and M3 (role gate refuses ADMIN `github-*`); main's full suite passes under all three (1839 pass, 0 fail). |
| `REQ-agent-roles-001` | `tests/roles.chat.gates.test.ts` | The existing catalog, (a) non-ADMIN refusal, (b) files-write / shell-exec and (c) channel allowlist tests still pass (7 pass, 0 fail in the file). |

## Mutation proof

Each mutation is applied to main's source, run, then reverted with
`git checkout`:

```bash
# M1 src/plugins/run.ts: SAFE-1 deny skipped for ADMIN github-* calls
# M2 src/plugins/githubPublic.ts: ADMIN returns ok before checkGithubRepo
# M3 src/plugins/run.ts: role gate refuses ADMIN github-* calls
bun test                                   # main's tests: 1839 pass, 0 fail under each
bun test tests/roles.chat.gates.test.ts    # branch: 6 pass, 1 fail under each
```

## Gates

```bash
bun test tests/roles.chat.gates.test.ts
bun test
bunx tsc --noEmit
specsync check --require-coverage 100
specsync change audit
fledge lanes run verify --non-interactive
```

## Where these lessons go

- `specs/agent/context.md`
