---
change: discord-channel-autocomplete-for-admin-and-announce-returns-no-choices-unless-the-invoker-is-admin-in-an-allowlisted
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-431` | `tests/discord.channel-autocomplete.test.ts` › "owner in an allowlisted channel keeps today's choices" | Owner in the allowlisted channel gets all guild text channels for `channels add` and `/announce channel`, only the live allowlist for `channels remove`, and query matching still works. |
| `REQ-discord-431` | … › "a non-owner in an allowlisted channel gets no choices (no allowlist leak)" | Non-owner gets `[]` for add, remove and announce, with and without a query. |
| `REQ-discord-431` | … › "a non-owner on the user allowlist is still not ADMIN" | A user-allowlisted non-owner (STANDARD) gets `[]`. |
| `REQ-discord-431` | … › "the owner outside an allowlisted channel gets no choices" | Owner in a channel that is not allowlisted gets `[]`. |
| `REQ-discord-431` | … › "a muted owner or an owner holding a deny-listed role gets no choices" | A deny-role owner gets `[]`. The unmuted owner still gets choices. After `muteUser(owner)` all three commands give `[]` (live mute set). |
| `REQ-discord-431` | … › "no owner configured: nobody gets choices (IDENTITY-3 / ADMIN-4)" | With no owner, every caller gets `[]`. |
| `REQ-discord-431` | … › "the gateway fails closed: no gate wired, a false gate or a throwing gate" | No gate, a false gate or a throwing gate gives `[]` (exactly one `respond`). The gate receives `{commandName, channelId, userId, roleIds}`. A true gate gives today's choices. |

## Automated coverage

- `bun test tests/discord.channel-autocomplete.test.ts`: 16 pass on the
  branch.
- Fail-on-main proof. `src/discord/gateway.ts` and `src/discord/bridge.ts`
  were swapped for `origin/main`'s copies and then restored:
  - (a) As-is, the file fails to load (`respondChannelAutocomplete` is not
    exported): 0 pass, 1 fail.
  - (b) With only `export` added to main's function: 10 pass, 6 fail. Every
    gate test fails; the owner-keeps-choices test passes, as expected.
- `bunx tsc --noEmit`, full `bun test`, `specsync check --require-coverage
  100` and `fledge lanes run verify --non-interactive` are green.
