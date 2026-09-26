---
id: safe-default-deny-allowlists-for-github-orgs-repos-users-and-discord-channels-roles-users-file-env-config-on-bot-vm
state: implementing
type: feature
base_commit: 33a6c7f74ef2c2521c5c6ea2de8e552551552e0c
---

# SAFE: default-deny allowlists for GitHub orgs/repos/users and Discord channels/roles/users; file+env config on bot VM; empty allowlist denies all; AlgoChat wallets deferred (WALLET HI only); integrates GITHUB-6; Discord stub for HEAR #5

## Intent

SAFE: default-deny allowlists for GitHub orgs/repos/users and Discord channels/roles/users; file+env config on bot VM; empty allowlist denies all; AlgoChat wallets deferred (WALLET HI only); integrates GITHUB-6; Discord stub for HEAR #5

## Affected Canonical Specs

- `plugins`
- `cli`

## Acceptance Criteria

- Empty/missing allowlist refuses targeted GH plugin runs and Discord channel posts/listens (default-deny); allow match passes; deny override wins; file+env load (CORVIDINHO_ALLOWLIST_FILE or ~/.config/corvidinho/allowlist.toml|json); Discord stub API for HEAR; HI allow.md ALLOW/WALLET captured; STATUS/README document VM config; wallets deferred (no wallet code); bun test + fledge verify + Spec Sync CI green

## No-spec Rationale

Not applicable
