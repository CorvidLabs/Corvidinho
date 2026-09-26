---
hi-draft: 1
families: [IDENTITY]
owner: leif
status: confirmed-captured-see-hi
issue: 42
---

# IDENTITY (draft) — owner Leif / 0xLeif

> **CAPTURED.** Leif confirmed; live criteria are in `hi/`. This file is historical provenance only.
> Issue: [#42](https://github.com/CorvidLabs/Corvidinho/issues/42).

## Intent

Corvidinho should know **Leif** (GitHub **0xLeif**, Discord user when configured) as **owner** via durable config + memory — so admin, autonomy pings, and personality notes have a real target, not prompt folklore.

## Proposed criteria (for Leif)

- **IDENTITY-1**  I can declare the owner (GitHub login and/or Discord snowflake) in durable project/agent config that survives restarts.
- **IDENTITY-2**  The running agent loads that owner record and uses it for owner-only paths (ADMIN bootstrap, AUTONOMY pings) without hard-coding secrets in the repo.
- **IDENTITY-3**  Owner notes can attach to MEMORY people/entities (contact “Leif”) without a separate on-chain identity product.
- **IDENTITY-4**  Empty allowlists stay **deny-all**; knowing the owner does not bypass ALLOW/DISCORD channel gates.

## Provenance (steal, do not invent)

corvid-agent: owner-question-manager, contacts / contact_identities, discord-config, persona inject (personality shape only). No `identity-verification` on-chain port. See #42 / closed #38.

## Non-goals

ACCESS, bounty, MainNet identity; inventing `hi/` before confirm.
