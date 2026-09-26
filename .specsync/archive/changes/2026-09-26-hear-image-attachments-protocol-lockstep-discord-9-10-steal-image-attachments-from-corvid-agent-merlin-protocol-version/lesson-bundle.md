# Lesson bundle — hear-image-attachments-protocol-lockstep-discord-9-10-steal-image-attachments-from-corvid-agent-merlin-protocol-version

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: HEAR image attachments + protocol lockstep (DISCORD-9,10) — steal image-attachments from corvid-agent + Merlin protocol-version; fixture tests; no ProcessManager; STATUS Done for #14
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/discord/image-attachments.ts, src/discord/protocol-version.ts, src/discord/types.ts, src/discord/gateway.ts, src/discord/bridge.ts, src/discord/message-router.ts, src/discord/index.ts, STATUS.md, specs/discord/discord.spec.md, specs/discord/requirements.md, specs/discord/testing.md, specs/discord/context.md, tests/discord.image-attachments.test.ts, tests/discord.protocol-version.test.ts, tests/discord.bridge.cli.test.ts, tests/discord.router.test.ts, tests/discord.admin-reauth.test.ts, tests/discord.slash.test.ts
- **Acceptance**: Images attached in Discord are downloaded (MIME allowlist jpeg/png/gif/webp; 20MB and 5-image caps) and written under /tmp/corvidinho-images so the agent prompt includes real local file paths the agent can look at (DISCORD-9; steal corvid-agent image-attachments + Merlin localPath). Bridge protocol-version.ts (Merlin-shaped) hard-fails startup on verifiable version mismatch and soft-continues when unverifiable (DISCORD-10). Fixture tests without live Discord token; allowlists stay default-deny; no ProcessManager; STATUS Done cites #14→this PR when merged.

## Evidence

- Verification commit: `716b0cb8b0c59d8ea68ece5a3a2b8c83f5940f3f`
- Base commit: `6116dd1c2c8773880f3f5183dad4b27dfb87303a`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Issue #14 HI: DISCORD-9 images as files agent can look at; DISCORD-10 protocol
version mismatch refuses start. Provenance: corvid-agent image-attachments.ts;
Merlin protocol-version.ts. Depends on #5 thin. Skip #9. Default-deny
allowlists unchanged. No ProcessManager / iced UI.

## From the change's design.md

# Design

## DISCORD-9

Corvid-agent multimodal extraction (base64 blocks, URL fallback, MIME/size/count
caps) plus Merlin write-to-disk so the headless CLI prompt can cite absolute
paths. `routeMessage` stays sync; async download lives in bridge
`enrichPromptWithImages` immediately before `agent.runChat`. Cache dir
`/tmp/corvidinho-images`. No Anthropic SDK dependency — local ContentBlock types.

## DISCORD-10

Keep Merlin handshake semantics already in the thin slice; rename module to
`protocol-version.ts` for provenance alignment. Soft-fail unverifiable;
hard-exit mismatch via `enforceProtocolVersionOrExit`. Never cite archive
`bridge-protocol.ts`.

## From the change's testing.md

# Testing

- Unit: MIME allowlist, 20MB/5 caps, base64 blocks, localPath write,
  enrichPromptWithImages (mocked fetch; no live CDN).
- Protocol: match / mismatch / unverifiable / timeout via shell stubs
  (Merlin protocol-version.test.ts shape).
- Existing bridge/router/slash/admin fixtures remain green.
- No live Discord token. Allowlists stay default-deny.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-013 | `tests/discord.image-attachments.test.ts` — extract/localPath/enrich |
| REQ-discord-006 | `tests/discord.protocol-version.test.ts` + `tests/discord.bridge.cli.test.ts` — handshake + CLI print |

## Automated coverage

- `bun test tests/discord.image-attachments.test.ts tests/discord.protocol-version.test.ts`
- `bunx tsc --noEmit`
- `specsync check --spec discord`
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/discord/context.md`
