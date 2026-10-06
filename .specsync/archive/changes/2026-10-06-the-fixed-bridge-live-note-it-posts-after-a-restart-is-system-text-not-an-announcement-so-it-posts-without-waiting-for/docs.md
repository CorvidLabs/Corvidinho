---
change: the-fixed-bridge-live-note-it-posts-after-a-restart-is-system-text-not-an-announcement-so-it-posts-without-waiting-for
artifact: docs
---

# Docs

- `docs/discord.md` "The must-ask list": the "Not on the list" line now says
  the bridge-live note is system text, not an announcement it starts, so it
  goes out after every successful restart, only to the `/announce` channel,
  without waiting for the owner's OK (AUTONOMY-10.b): no card, no hold line,
  not one of the 20 public-thread replies, fixed template only; a
  `discord-post-message` with the same words still waits (AUTONOMY-10.a).
- `docs/DISCORD-GO-LIVE.md` must-ask bullet: one sentence that the fixed
  bridge-live note never waits for a card (AUTONOMY-10.b).
- Specs: `discord.spec.md` (the update-post Public API paragraph and an
  invariant), `specs/discord/testing.md` (evidence), REQ-discord-024 through
  the delta.
- `hi/autonomy.md` and `INTENT.md` (criteria count) from the `hi` capture.
- No README, CHANGELOG, STATUS or package.json edit (the release PR writes
  them).
