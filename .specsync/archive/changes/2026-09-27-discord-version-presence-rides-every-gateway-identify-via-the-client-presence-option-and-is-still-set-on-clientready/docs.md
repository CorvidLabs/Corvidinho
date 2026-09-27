---
change: discord-version-presence-rides-every-gateway-identify-via-the-client-presence-option-and-is-still-set-on-clientready
artifact: docs
---

# Docs

- `specs/discord/discord.spec.md` Public API: the presence line says the
  Client `presence` option carries the version on every IDENTIFY and
  ClientReady still sets it.
- `specs/discord/testing.md`: presence section lists the new tests.
- `docs/discord.md` formatting table: the Presence row says the status is
  sent on every gateway IDENTIFY (also on the DISCORD-8 requester-check
  login) and set again on ready.

No README, CHANGELOG or STATUS change; no version bump.
