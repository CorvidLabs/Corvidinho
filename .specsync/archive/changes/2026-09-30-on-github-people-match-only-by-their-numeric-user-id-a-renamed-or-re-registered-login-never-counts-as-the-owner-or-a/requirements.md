---
change: on-github-people-match-only-by-their-numeric-user-id-a-renamed-or-re-registered-login-never-counts-as-the-owner-or-a
artifact: requirements
---

# Requirements

- Added **REQ-discord-367** (delta `deltas/discord.md`): GitHub matches the
  numeric user id only — resolver and GitHub memory subject ignore logins;
  `[owner] github_id`; `isOwnerGithub` by id; `/admin people link github:`
  looks the id up once (owner-only, audited) and stores it in `github_ids`;
  login-only entries keep loading but do not match on GitHub.
- Modified **REQ-discord-036** (resolver: Discord id + GitHub numeric id
  only; owner id joins the owner's person), **REQ-discord-042** (owner
  record: `[owner] github_id`; owner never matched by login),
  **REQ-discord-067** (`memorySubjectForGithub` by id only).
- Added **REQ-watch-367** (delta `deltas/watch.md`): every WATCH recognition
  path (identity block, memory inject, memory plugins, SAFE-13 exemption)
  matches `senderId` only; no / undeclared id is community; the live Octokit
  client maps `user.id` → `senderId`.
- Modified **REQ-watch-036**, **REQ-watch-071**, **REQ-watch-067** to the
  numeric-id rule.
- Modified **REQ-plugins-067** (memory plugins on GitHub by numeric id).
- Modified **REQ-agent-071** (one bullet: the SAFE-13 WATCH exemption test is
  by numeric id).
- Added **REQ-cli-367** (delta `deltas/cli.md`): doctor `[warn]
  people-github`.
- HI: IDENTITY-7.a (captured in this PR). IDENTITY-7, IDENTITY-1..14,
  ADMIN-3.a, SAFE-5, SAFE-13, MEMORY-8 unchanged. No acceptance criteria
  beyond the captured text; open design points are in `design.md`.
