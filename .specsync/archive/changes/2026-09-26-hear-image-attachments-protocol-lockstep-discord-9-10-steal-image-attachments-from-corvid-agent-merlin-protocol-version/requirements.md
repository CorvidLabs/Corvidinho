---
change: hear-image-attachments-protocol-lockstep-discord-9-10-steal-image-attachments-from-corvid-agent-merlin-protocol-version
artifact: requirements
---

# Requirements

## DISCORD-9 — image attachments as files

- Steal `extractImageBlocks` / multimodal / MIME allowlist / 20MB / 5 caps from
  archived corvid-agent `server/discord/image-attachments.ts`.
- Merlin localPath: download at receive time and write under
  `/tmp/corvidinho-images` so the agent prompt includes real file paths the
  agent can open (HI: "files it can actually look at").
- Gateway maps discord.js attachments onto `InboundMessage.attachments`;
  bridge calls `enrichPromptWithImages` before `agent.runChat`.
- Fixture tests without live Discord token. No ProcessManager. Allowlists
  stay default-deny. Do not invent ACCESS/bounty/MainNet Intent.

## DISCORD-10 — protocol lockstep

- Merlin-primary: rename/promote `protocol.ts` → `protocol-version.ts` (Merlin
  `bridges/discord/src/protocol-version.ts` shape).
- Hard-fail on verifiable version mismatch; soft-continue when unverifiable.
- Do **not** use archive `shared/bridge-protocol.ts` (file/exec auth — wrong).
- CLI `--protocol-version` prints the integer; fixture stub-binary tests.
