---
change: roles-chat-7-b-an-admin-role-session-s-github-pr-create-is-tested-safe-1-denies-it-without-an-allowlist-entry-github-6
artifact: testing
---

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
