---
id: admin-3-c-part-2-as-owner-i-can-mute-and-unmute-with-admin-mutes-add-remove-mute-and-unmute-are-audited-aliases-of-the
state: approved
type: feature
base_commit: 8aa502a19e5877444afe54944869bffb02953b5d
---

# ADMIN-3.c part 2: as owner I can mute and unmute with /admin mutes add|remove; /mute and /unmute are audited aliases of the same helper

## Intent

ADMIN-3.c part 2: as owner I can mute and unmute with /admin mutes add|remove; /mute and /unmute are audited aliases of the same helper

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- ADMIN-3.c (captured on main from Leif's 2026-09-28 interview, round 10; this is part 2 and completes it with mutes after part 1's deny lists and GitHub repo allow lists): the owner-only /admin mutes add|remove takes a required user (USER option) and mutes or unmutes that Discord user in the live in-memory mute set the chat, slash and ask-button gates already read; /mute and /unmute (REQ-discord-009) are aliases served by the same audited helper with the same SAFE-5 actions admin-mutes-add|remove (surface discord:admin; started before the change, then ok; refusals denied); a mute of the owner or of the caller is refused (denied row, set unchanged); with no audit trail wired or a trail that throws the helper refuses with audit log unavailable (SAFE-5) and the mute set is unchanged; a mute that is already in place or an unmute of someone not muted is a no change reply with no rows; mutes stay in memory until a restart (DISCORD_MUTED_USER_IDS still seeds them) and the mute reply says so and points to /admin deny add user: for a lasting block; /admin config show names /admin mutes add|remove among the updatable knobs; non-owners are refused at dispatch and at the /admin handler re-check (denied row); no new env var, config key, table, schema or protocol change; tests/discord.admin-mutes.test.ts fails on the stacked base sources and passes on the branch, and the admin-reauth and owner test fixtures wire recordAudit

## No-spec Rationale

Not applicable
