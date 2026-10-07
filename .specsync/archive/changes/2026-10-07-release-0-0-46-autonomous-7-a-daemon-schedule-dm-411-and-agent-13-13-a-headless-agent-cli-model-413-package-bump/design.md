---
change: release-0-0-46-autonomous-7-a-daemon-schedule-dm-411-and-agent-13-13-a-headless-agent-cli-model-413-package-bump
artifact: design
---

# Design

Package-only release cut. No schema, protocol, or runtime surface change beyond the version string reported by CLI `version` and Discord presence (DISCORD-12) after restart. CI `release.yml` tags `v0.0.46` when the bump lands on main.
