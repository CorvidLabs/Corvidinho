---
change: discord-post-message-checks-the-acting-discord-user-the-bridge-set-not-only-a-model-supplied-id-discord-8
artifact: docs
---

# Docs

- `docs/discord.md`: new "Posts to another channel (DISCORD-8)" subsection:
  allowlist first, the acting user's View Channel + Send Messages in bridge
  runs, a different `--requesting-user-id` refused, fail closed when the check
  cannot run (Server Members Intent), unchanged outside the bridge.
- `docs/DISCORD-GO-LIVE.md`: the Server Members Intent line now says the check
  runs on every `discord-post-message` in a bridge-started run (whenever the
  tool is allowlisted), for the acting user; the allowlist table row for
  `discord-post-message` says the owner's runs can post only where the owner
  could.
- `.env.example`: strict mode requires `--requesting-user-id` only outside a
  bridge-started run; bridge runs always check the acting user.
- `specs/discord/discord.spec.md` invariant + error row,
  `specs/discord/requirements.md` REQ-discord-012, `specs/discord/testing.md`.
- No CHANGELOG / package version edit (bug-fix slice).
