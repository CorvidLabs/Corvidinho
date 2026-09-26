---
change: safe-default-deny-allowlists-for-github-orgs-repos-users-and-discord-channels-roles-users-file-env-config-on-bot-vm
artifact: research
---

# Research

Prior GITHUB-6: empty `CORVIDINHO_GITHUB_ALLOW_REPOS` allowed all (deny-only). Merlin permission empty→BASIC is the anti-pattern to forbid. Prefer explicit allow entries on the bot VM. AlgoChat/wallet ACT deferred until WALLET allowlist exists.
