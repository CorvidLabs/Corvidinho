---
change: safe-default-deny-allowlists-for-github-orgs-repos-users-and-discord-channels-roles-users-file-env-config-on-bot-vm
artifact: context
---

# Context

Issue #16 / Leif CoS 2026-09-26: default-deny allowlists before HEAR go-live / widening ACT.
HI confirmed in `hi/allow.md` (ALLOW-1..6, WALLET-1..3). Existing GITHUB-6 treated empty
`CORVIDINHO_GITHUB_ALLOW_REPOS` as allow-all — Merlin-shaped foot-gun (empty permissions → BASIC).
This change flips to empty/missing = deny-all for GH repo/org/user and Discord channel/role/user.
Wallets: HI + STATUS deferral only; no wallet ACT code. HEAR #5 still blocked on wiring this API.
