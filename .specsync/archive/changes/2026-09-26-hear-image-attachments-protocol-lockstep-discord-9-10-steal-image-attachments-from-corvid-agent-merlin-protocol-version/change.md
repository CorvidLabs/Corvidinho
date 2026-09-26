---
id: hear-image-attachments-protocol-lockstep-discord-9-10-steal-image-attachments-from-corvid-agent-merlin-protocol-version
state: archived
type: feature
base_commit: 6116dd1c2c8773880f3f5183dad4b27dfb87303a
---

# HEAR image attachments + protocol lockstep (DISCORD-9,10) — steal image-attachments from corvid-agent + Merlin protocol-version; fixture tests; no ProcessManager; STATUS Done for #14

## Intent

HEAR image attachments + protocol lockstep (DISCORD-9,10) — steal image-attachments from corvid-agent + Merlin protocol-version; fixture tests; no ProcessManager; STATUS Done for #14

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- Images attached in Discord are downloaded (MIME allowlist jpeg/png/gif/webp; 20MB and 5-image caps) and written under /tmp/corvidinho-images so the agent prompt includes real local file paths the agent can look at (DISCORD-9; steal corvid-agent image-attachments + Merlin localPath). Bridge protocol-version.ts (Merlin-shaped) hard-fails startup on verifiable version mismatch and soft-continues when unverifiable (DISCORD-10). Fixture tests without live Discord token; allowlists stay default-deny; no ProcessManager; STATUS Done cites #14→this PR when merged.

## No-spec Rationale

Not applicable
