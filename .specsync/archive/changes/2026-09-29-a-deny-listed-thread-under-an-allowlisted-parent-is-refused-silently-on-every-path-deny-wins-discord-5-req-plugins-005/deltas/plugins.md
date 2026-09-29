---
module: plugins
change: a-deny-listed-thread-under-an-allowlisted-parent-is-refused-silently-on-every-path-deny-wins-discord-5-req-plugins-005
---

# Delta: plugins (isChannelDenied, deny wins over an allowlisted parent)

## Modified

### REQUIREMENT REQ-plugins-005

Allowlists SHALL default-deny: empty or missing allow entries refuse targeted GitHub plugin runs and Discord channel/role/user checks (ALLOW-1..5, GITHUB-6, DISCORD-5). Deny overrides always win. Empty lists MUST NOT map to allow-all or Merlin BASIC.

`isChannelDenied` (`src/allowlist/discord.ts`) SHALL report a
`deny_channels` hit alone, case-insensitively and trimmed like
`checkChannel` (which uses it), so a thread gate can make a deny on the
thread or its parent win over the other being allowlisted (REQ-discord-212).

Acceptance Criteria
- Empty/missing allowlist refuses GH `--repo` targets (exit 3 / not authorized).
- Discord stub `checkChannel`/`checkRole`/`checkUser` refuse when allow lists empty.
- Regression: empty allow never permits a target (Merlin empty→BASIC forbidden).
- `isChannelDenied` is true for a deny-listed id (any case, surrounding space trimmed) and false for allowlisted, unlisted, empty or missing ids; `checkChannel` reports that id as denied.
