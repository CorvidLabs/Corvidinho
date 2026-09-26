---
change: hear-image-attachments-protocol-lockstep-discord-9-10-steal-image-attachments-from-corvid-agent-merlin-protocol-version
artifact: plan
---

# Plan

1. Rename `protocol.ts` → `protocol-version.ts`; update imports + CLI help.
2. Add `image-attachments.ts` (corvid-agent API + Merlin localPath).
3. Extend `InboundMessage` + gateway mapping; bridge enrich before spawn.
4. Fixture tests for images + protocol-version (no live token).
5. SpecSync discord delta + companions; STATUS Done for #14; verify lane.
6. PR → CI green → squash-merge → close #14.
