---
module: discord
artifact: testing
---

# testing

See discord.spec.md, docs/DISCORD-GO-LIVE.md, and SpecSync change artifacts for HEAR #5.

- DISCORD-3: thinking-status builders + bridge progress edit sequence (no live token).

## Slash commands (DISCORD-4)

- `tests/discord.slash.test.ts` covers command bodies, dispatch gates, and
  session/status/agents/work handlers with fixture interactions (no live token).
- `tests/discord.register-commands.test.ts` covers guild PUT then clear-globals
  put order (REQ-discord-016; injectable put; no live token).

## Rate limits + mutes (DISCORD-6)

- `tests/discord.rate-mute.test.ts` covers checkRateLimit, mute/unmute,
  router + slash per-user independence (no live token).

## Admin re-auth + confused-deputy (DISCORD-7 / 8)

- `tests/discord.admin-reauth.test.ts` — resolvePermissionLevel + mute/unmute
  minPermission re-check (no live token).
- `tests/discord.requester-perms.test.ts` — evaluateRequesterCanSend + post
  plugin requester/strict gates (no live token).

## Image attachments + protocol lockstep (DISCORD-9 / 10)

- `tests/discord.image-attachments.test.ts` — MIME allowlist, size/count caps,
  base64 blocks, localPath write, enrichPromptWithImages (no live token).
- `tests/discord.protocol-version.test.ts` — Merlin-shaped handshake match /
  mismatch / unverifiable / timeout (stub binaries; no live token).

