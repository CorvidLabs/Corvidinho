---
module: discord
change: docs-operator-docs-match-the-code-help-and-the-go-live-checklist-say-empty-discord-user-role-allowlists-admit-anyone-in
---

# Delta: discord (the go-live checklist says what empty user/role lists do)

## Modified

### REQUIREMENT REQ-discord-005

When DISCORD_TOKEN and DISCORD_BOT_TOKEN are both missing, the CLI/doctor/bridge SHALL explain the requirement and exit cleanly without crashing. Secrets SHALL never be committed to the repo.

Acceptance Criteria
- `corvidinho discord bridge` without token exits non-zero naming DISCORD_TOKEN / DISCORD_BOT_TOKEN and go-live checklist.
- The go-live checklist (`goLiveChecklist()`, printed by `doctor` and `discord bridge`) says users and roles both empty admit anyone in an allowlisted channel and once either is set only those users, role holders and the owner (REQ-discord-043); it never says empty user/role lists are deny-all.
