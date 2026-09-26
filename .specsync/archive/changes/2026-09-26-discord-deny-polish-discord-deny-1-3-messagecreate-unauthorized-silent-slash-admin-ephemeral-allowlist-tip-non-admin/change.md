---
id: discord-deny-polish-discord-deny-1-3-messagecreate-unauthorized-silent-slash-admin-ephemeral-allowlist-tip-non-admin
state: archived
type: feature
base_commit: 261fe6a9cb5028b2c4250eaee15ad259b6353057
---

# Discord deny polish (DISCORD-DENY-1..3): MessageCreate unauthorized silent; slash admin ephemeral allowlist tip, non-admin ephemeral zero-width ack; docs/discord.md with slash inventory + deny mermaid flowchart; no public not-authorized leaks

## Intent

Discord deny polish (DISCORD-DENY-1..3): MessageCreate unauthorized silent; slash admin ephemeral allowlist tip, non-admin ephemeral zero-width ack; docs/discord.md with slash inventory + deny mermaid flowchart; no public not-authorized leaks

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- MessageCreate outside allowlist never public-replies (silent for all); slash outside allowlist: admin gets ephemeral allowlist tip, non-admin gets ephemeral zero-width ack only (Discord 3s rule); no public not-authorized; docs/discord.md covers 6 slash cmds, outbound formats, deny mermaid flowchart, mermaid-docs-only note; links from STATUS/AGENTS/README/hi/discord; fixture tests for router+slash deny; SpecSync+fledge verify green

## No-spec Rationale

Not applicable
