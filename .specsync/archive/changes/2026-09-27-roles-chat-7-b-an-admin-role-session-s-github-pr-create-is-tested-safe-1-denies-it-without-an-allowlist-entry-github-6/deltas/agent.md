---
module: agent
change: roles-chat-7-b-an-admin-role-session-s-github-pr-create-is-tested-safe-1-denies-it-without-an-allowlist-entry-github-6
---

# Delta — agent (ROLES-CHAT-7(b): an ADMIN role session's github-pr-create stays SAFE-1 and GITHUB-6 gated)

## Added

### REQUIREMENT REQ-agent-165

ROLES-CHAT-7(b) prove-before-done for GitHub PR creation. When an ADMIN role
session (`CORVIDINHO_ACTING_IS_ADMIN=1` and the acting Discord user is the
configured owner, re-checked by `resolveActingIsAdmin`, ROLES-CHAT-4/6) runs
`github-pr-create` non-interactively through `runPlugin` (the tool loop's
dispatch, REQ-agent-008), the ROLES-CHAT role gate SHALL let it through, and
the call SHALL still be gated by SAFE: with no `github-pr-create` entry in
the allowlist it SHALL be refused with exit 2 and the SAFE-1 denial (not the
"not allowed for your role" refusal), and nothing is created; with the entry
but an empty GITHUB-6 repo allowlist it SHALL be refused with exit 3 and a
GITHUB-6 error; with the entry and the repo on the GITHUB-6 repo allowlist
(`CORVIDINHO_GITHUB_ALLOW_REPOS`) the dry-run (`CORVIDINHO_GITHUB_DRY_RUN=1`)
SHALL succeed and return the PR it would open. The proof runs dry-run only,
with the GitHub token and allow/deny env cleared: no network, no token. No
product code, flag, environment variable, config key or slash command is
added.

Acceptance Criteria
- `tests/roles.chat.gates.test.ts` "(b) admin github-pr-create: SAFE-1 denies without an allowlist entry; dry-run ok with the allowlist + GITHUB-6 repo allowlist": as the configured owner with `CORVIDINHO_ACTING_IS_ADMIN=1`, `resolveActingIsAdmin()` is true; `github-pr-create --repo CorvidLabs/Corvidinho …` with an empty allowlist returns `ok: false`, exit 2, an error containing `SAFE-1` and not `not allowed for your role`.
- The same call with `allowlist: ["github-pr-create"]` and no GITHUB-6 repo allowlist returns `ok: false`, exit 3, an error containing `GITHUB-6`.
- With `CORVIDINHO_GITHUB_ALLOW_REPOS=CorvidLabs/Corvidinho` added, it returns `ok: true`, exit 0 and data `{ dryRun: true, owner: "CorvidLabs", repo: "Corvidinho", title, head, base }` as given.
- The test fails when SAFE-1 is skipped for ADMIN GitHub writes, when the GITHUB-6 repo gate is skipped for ADMIN, or when the role gate refuses ADMIN; the suite on main before this change passes under each of those three mutations.
