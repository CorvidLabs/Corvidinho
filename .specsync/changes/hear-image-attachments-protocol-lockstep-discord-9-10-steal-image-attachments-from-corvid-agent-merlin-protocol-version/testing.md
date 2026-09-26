---
change: hear-image-attachments-protocol-lockstep-discord-9-10-steal-image-attachments-from-corvid-agent-merlin-protocol-version
artifact: testing
---

# Testing

- `tests/discord.image-attachments.test.ts` — allowlist, caps, base64, localPath, enrich (mocked fetch).
- `tests/discord.protocol-version.test.ts` — match/mismatch/unverifiable/timeout via shell stubs.
- Existing bridge/router/slash/admin fixtures remain green.
- No live Discord token. `fledge lanes run verify --non-interactive`.
