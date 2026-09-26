---
change: hear-image-attachments-protocol-lockstep-discord-9-10-steal-image-attachments-from-corvid-agent-merlin-protocol-version
artifact: testing
---

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
