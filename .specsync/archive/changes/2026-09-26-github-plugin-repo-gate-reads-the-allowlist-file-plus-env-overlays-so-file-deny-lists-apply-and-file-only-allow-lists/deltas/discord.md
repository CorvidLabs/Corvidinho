---
module: discord
change: github-plugin-repo-gate-reads-the-allowlist-file-plus-env-overlays-so-file-deny-lists-apply-and-file-only-allow-lists
---

# Delta — discord (/work PR repo gate reads the allowlist file)

## Added

### REQUIREMENT REQ-discord-253

The GITHUB-6 repo gate the `/work` draft-PR step (REQ-discord-088) applies to
the push remote's OWNER/REPO SHALL, by default, use the allowlist file plus
env overlays (ALLOW-4, `checkRepoGateAsync`), not env overlays alone, so a
`deny_repos` / `deny_orgs` entry in the file refuses the PR step even when
the allow list comes from env, and an allow list only in the file admits the
repo. A refusal SHALL be reported as `repo-denied` before any commit, push,
verify or PR call. No new env var, config key, slash command or option.

Acceptance Criteria
- File deny + env allow: the `/work` PR step says `not opened` with the GITHUB-6 denial, calls no plugin and pushes nothing.
- File-only allow: the `/work` PR step opens the draft PR (dry run in tests).
