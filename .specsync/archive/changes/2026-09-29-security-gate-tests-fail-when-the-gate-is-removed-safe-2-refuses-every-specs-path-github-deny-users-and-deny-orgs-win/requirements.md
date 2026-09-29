---
change: security-gate-tests-fail-when-the-gate-is-removed-safe-2-refuses-every-specs-path-github-deny-users-and-deny-orgs-win
artifact: requirements
---

# Requirements

Captured HI met (no new criteria; no `hi/` edits):

- **SAFE-2** (hi/safe.md): protected project infra (including `specs/`) is
  hard-refused by the file tools with no override.
- **ALLOW-2 / ALLOW-5 / GITHUB-6** (hi/allow.md, hi/github.md): a request
  must match what Leif allowed, a denied contact is refused quietly, and there
  are repos it will not touch; the specs make deny lists win over allow lists
  (REQ-plugins-004 / 005). Covered for WATCH ingress and `git-push`.
- **ROLES-CHAT-8** (hi/roles.md): community sessions may use public GitHub;
  "refuse private repo access".
- **DISCORD-8** (hi/discord.md): the bridge checks that the requester could
  have posted there, not only the bot.

Canonical requirements changed (see deltas):

- Added **REQ-plugins-493**: the ROLES-CHAT-8 private / unconfirmed refusal
  through the Octokit visibility lookup. It states behaviour already in
  `plugins.spec.md` ("Private or unknown visibility is refused") that no REQ
  held; no new behaviour.
- Modified **REQ-plugins-004**, **REQ-plugins-083**, **REQ-plugins-182**,
  **REQ-watch-003**, **REQ-discord-012**: text unchanged; acceptance bullets
  added for the new tests.
- REQ-plugins-005 and REQ-discord-476 unchanged; the new tests are evidence
  for them too.
