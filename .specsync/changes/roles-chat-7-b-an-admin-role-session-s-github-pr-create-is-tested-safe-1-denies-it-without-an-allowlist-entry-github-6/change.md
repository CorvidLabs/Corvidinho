---
id: roles-chat-7-b-an-admin-role-session-s-github-pr-create-is-tested-safe-1-denies-it-without-an-allowlist-entry-github-6
state: implementing
type: bug_fix
base_commit: fbaa84b7cda1bf2b462baea44cad20ef93e0df4f
---

# ROLES-CHAT-7(b): an ADMIN role session's github-pr-create is tested: SAFE-1 denies it without an allowlist entry, GITHUB-6 still refuses an unlisted repo, and the dry-run PR goes through with the allowlist entry plus the GITHUB-6 repo allowlist

## Intent

ROLES-CHAT-7(b): an ADMIN role session's github-pr-create is tested: SAFE-1 denies it without an allowlist entry, GITHUB-6 still refuses an unlisted repo, and the dry-run PR goes through with the allowlist entry plus the GITHUB-6 repo allowlist

## Affected Canonical Specs

- `agent`

## Acceptance Criteria

- In tests/roles.chat.gates.test.ts, an ADMIN role session (CORVIDINHO_ACTING_IS_ADMIN=1, acting user = configured owner) running github-pr-create non-interactively is refused with exit 2 and a SAFE-1 error (not the role refusal) when the allowlist has no github-pr-create entry; with the entry but an empty GITHUB-6 repo allowlist it is refused with exit 3 and a GITHUB-6 error; with the entry plus CORVIDINHO_GITHUB_ALLOW_REPOS=CorvidLabs/Corvidinho the dry-run PR returns ok with dryRun true and the given owner, repo, title, head and base. The test fails if SAFE-1 or the GITHUB-6 repo gate is skipped for ADMIN github writes, or if the role gate refuses ADMIN; main's suite catches none of these.

## No-spec Rationale

Not applicable
