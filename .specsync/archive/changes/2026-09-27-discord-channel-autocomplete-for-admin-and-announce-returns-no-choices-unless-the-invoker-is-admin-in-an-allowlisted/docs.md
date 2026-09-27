---
change: discord-channel-autocomplete-for-admin-and-announce-returns-no-choices-unless-the-invoker-is-admin-in-an-allowlisted
artifact: docs
---

# Docs

- `docs/discord.md` has a note under the slash gate order: channel
  autocomplete is re-checked per request (channel allowlist → actor gate →
  ADMIN, with mutes), anyone else gets an empty list, and autocomplete does
  not count toward the rate limit.
- `specs/discord/discord.spec.md`:
  - Public API paragraph for `respondChannelAutocomplete`,
    `GatewayHandlers.mayAutocompleteChannels` and `AutocompleteActor`.
  - An invariant, a behavioural scenario and two error-table rows. The test
    file is already in `files:`.
- `specs/discord/requirements.md` gains REQ-discord-431 from the delta when
  the change is materialized.
- No CHANGELOG, STATUS or package.json edit (bug-fix slice).
