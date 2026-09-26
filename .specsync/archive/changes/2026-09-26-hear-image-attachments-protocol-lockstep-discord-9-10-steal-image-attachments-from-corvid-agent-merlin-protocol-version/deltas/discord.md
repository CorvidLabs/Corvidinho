---
module: discord
change: hear-image-attachments-protocol-lockstep-discord-9-10-steal-image-attachments-from-corvid-agent-merlin-protocol-version
---

# Delta — discord (DISCORD-9 image attachments + DISCORD-10 protocol lockstep)

## Added

### REQUIREMENT REQ-discord-013

The bridge SHALL make Discord image attachments available to the agent as
local files it can look at (DISCORD-9). Steal shape from corvid-agent
`image-attachments.ts`: MIME allowlist jpeg/png/gif/webp, 20MB size cap, max
5 images per message; download at receive time; multimodal blocks + URL
fallback. Merlin localPath: write under `/tmp/corvidinho-images` and include
paths in the agent prompt via `enrichPromptWithImages`. Non-image / oversized
/ failed downloads SHALL be skipped with a notice. The bridge SHALL NOT
introduce ProcessManager or weaken allowlists. Fixture tests SHALL cover
extraction and localPath without a live Discord token or live CDN.

Acceptance Criteria
- Supported image → downloaded + localPath under cache dir; prompt cites path.
- Unsupported MIME / oversize / over-5 → skipped; peers unaffected.
- Fixture tests for appendAttachmentUrls / buildMultimodalContent /
  enrichPromptWithImages; no live token; secrets out of repo; default-deny.

## Modified

### REQUIREMENT REQ-discord-006

The bridge SHALL check wire protocol version against
`corvidinho --protocol-version` via Merlin-shaped `protocol-version.ts`
(DISCORD-10): hard-fail on a verifiable mismatch; soft-continue if
unverifiable. Archive `shared/bridge-protocol.ts` SHALL NOT be used.

Acceptance Criteria
- `corvidinho --protocol-version` prints `1`.
- Verifiable mismatch refuses start; unverifiable warns and continues.
- Fixture stub-binary tests cover match/mismatch/unverifiable/timeout.
