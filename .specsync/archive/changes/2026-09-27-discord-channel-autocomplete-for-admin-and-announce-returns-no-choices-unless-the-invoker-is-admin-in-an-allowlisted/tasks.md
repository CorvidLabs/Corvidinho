---
change: discord-channel-autocomplete-for-admin-and-announce-returns-no-choices-unless-the-invoker-is-admin-in-an-allowlisted
artifact: tasks
---

# Tasks

- [x] Reproduce on `origin/main`: any guild member gets channel autocomplete
      choices, including the allowlist on `/admin channels remove`.
- [x] `GatewayHandlers.mayAutocompleteChannels` + `AutocompleteActor`; export
      `respondChannelAutocomplete`; answer `[]` when the gate is unset, false
      or throws; shared `memberRoleIds` helper.
- [x] Bridge wires the gate: `gateChannel` → `gateActor` →
      `resolvePermissionLevel` (with mutes) ≥ ADMIN; no rate-limit hit.
- [x] Regression tests in `tests/discord.channel-autocomplete.test.ts`;
      proven to fail with main's source and pass on the branch.
- [x] Delta REQ-discord-431; `specs/discord/discord.spec.md` Public API,
      invariant, scenario and error rows; `docs/discord.md` gate note.
- [x] SpecSync change check/audit, coverage, tsc, bun test and verify lane
      green.
