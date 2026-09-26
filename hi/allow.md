---
hi: 1
families: [ALLOW, WALLET]
owner: leif
---

# Guardrails

## Intent

Corvidinho must not spam strangers or dive into work people did not invite it into. Autonomy only inside allowlists I control. GitHub, Discord, and any AlgoChat/wallet path are default-deny until I name who and what is trusted. Config lives with the bot VM (file + env secrets), not baked into the repo.

## Criteria

- **ALLOW-1**  By default Corvidinho does not reply to or act on GitHub messages, mentions, or review requests from people, repos, or orgs that are not on an allowlist I control.
- **ALLOW-2**  I can allowlist GitHub organizations, repositories, and individual users separately, and a request must match what I allowed before it may respond or start autonomous work.
- **ALLOW-3**  By default it does not listen or post in Discord except in channels and for roles/users I allowlisted (admins can be one named class of that list).
- **ALLOW-4**  Allowlists load from config on the bot VM (config file and/or env); secrets stay in env/secret store, never committed.
- **ALLOW-5**  A denied contact is refused quietly or with a short “not authorized” — it does not keep arguing or doing the work anyway.
- **ALLOW-6**  Widening an allowlist is an explicit config change I make; the agent does not grow trust from chatting with someone new.

- **WALLET-1**  AlgoChat / Algorand wallet talk and payments stay off until I turn that lane on with an approved-wallet list.
- **WALLET-2**  When wallet is on, Corvidinho only trusts, messages, or pays wallets on that approved list — never a stranger address that DMs it.
- **WALLET-3**  My approved wallet is how it knows a message or payment is from me or for me on-chain.
