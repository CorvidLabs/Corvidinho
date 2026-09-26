---
change: hear-image-attachments-protocol-lockstep-discord-9-10-steal-image-attachments-from-corvid-agent-merlin-protocol-version
artifact: design
---

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
