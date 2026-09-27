---
change: discord-channel-autocomplete-for-admin-and-announce-returns-no-choices-unless-the-invoker-is-admin-in-an-allowlisted
artifact: research
---

# Research

- Repro on `origin/main` fbaa84b:
  - `src/discord/gateway.ts` `InteractionCreate` sends every
    `isAutocomplete()` interaction to `respondChannelAutocomplete`, which
    was not exported and had no gate. Only `admin channels remove` was
    scoped to `getAllowlistedChannelIds()`.
  - `grep -rn default_member_permissions src/discord` finds nothing, so
    Discord shows `/admin` and `/announce` to every member.
  - With main's source plus only the `export` keyword on
    `respondChannelAutocomplete`, the new fixture tests show the leak. A
    non-owner in the allowlisted channel gets all 5 guild text channels
    for `channels add` and `/announce channel`, and the allowlisted
    `#general` id for `channels remove`. The owner in a channel that is not
    allowlisted, a muted owner, an owner with a deny-listed role and every
    caller when no owner is configured get the same lists.
- The slash path already has the right gate order
  (`slash-dispatch.ts`: `gateChannel` → `gateActor` → mute/rate →
  `resolvePermissionLevel` ≥ minPermission). `/admin` has an ADMIN floor.
  `/announce channel` mutations re-check ADMIN in the handler
  (DISCORD-ANNOUNCE-5). So only ADMIN in an allowlisted channel could ever
  act on a choice.
- A Discord autocomplete must be answered within 3 s. `respond([])` shows
  "no options" and holds no data. This is the autocomplete form of the
  zero-width ack DISCORD-DENY-3 documents for slash.
