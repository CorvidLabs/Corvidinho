---
change: safe-default-deny-allowlists-for-github-orgs-repos-users-and-discord-channels-roles-users-file-env-config-on-bot-vm
artifact: testing
---

# Testing

## Local gates

- `bun test` (default-deny allowlist, GITHUB-6, Discord stub, SAFE-1 deny)
- `bunx tsc --noEmit`
- `bun src/cli.ts --help`
- `hi check`
- `specsync check`
- `specsync change audit`
- `fledge lanes run verify --non-interactive`

## CI

- **ci** smoke: Bun install/test/typecheck only
- **Spec Sync**: CorvidLabs/spec-sync@v6 + `specsync change audit` (no Fledge Actions)

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-plugins-004 | `tests/github.deny.test.ts` + `tests/github.deny.cli.test.ts` (empty deny-all, allow match, deny override) |
| REQ-plugins-005 | `tests/allowlist.default-deny.test.ts` empty≠BASIC + Discord empty deny; github.deny empty allow |
| REQ-plugins-006 | `tests/allowlist.default-deny.test.ts` file+env toml overlay load |
| REQ-plugins-007 | `tests/allowlist.default-deny.test.ts` checkChannel/Role/User |
| REQ-cli-005 | `tests/cli.smoke.test.ts` --help; STATUS.md / README.md allowlist VM notes |
