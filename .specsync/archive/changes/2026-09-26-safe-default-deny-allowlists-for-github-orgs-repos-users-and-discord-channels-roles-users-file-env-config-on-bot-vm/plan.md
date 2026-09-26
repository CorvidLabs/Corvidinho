---
change: safe-default-deny-allowlists-for-github-orgs-repos-users-and-discord-channels-roles-users-file-env-config-on-bot-vm
artifact: plan
---

# Plan

1. Capture `hi/allow.md` (ALLOW/WALLET) confirmed by Leif.
2. Add `src/allowlist/` loader + GH/Discord gates; wire `githubDeny` to default-deny.
3. Discord stub hooks; no bridge, no wallet code.
4. Spec deltas + tests (empty deny-all, allow match, deny override, Merlin empty≠BASIC).
5. STATUS/README VM config notes; SpecSync check → fledge verify → PR #16 → CI → merge.
