---
change: discord-deny-polish-discord-deny-1-3-messagecreate-unauthorized-silent-slash-admin-ephemeral-allowlist-tip-non-admin
artifact: plan
---

# Plan

1. Add `ALLOWLIST_DENY_TIP` (+ optional `EPHEMERAL_SILENT_ACK` = `\u200b`) in types.
2. `message-router.ts`: channel/gate deny → refuse without `reply` (silent).
3. `slash-dispatch.ts`: channel deny → resolve admin → ephemeral tip or zero-width.
4. Update router + slash fixture tests for DENY-1..3.
5. Create `docs/discord.md`; link from STATUS/AGENTS/README/hi/discord.
6. Spec delta REQ-discord-018; SpecSync check → verify → PR → merge when green.
