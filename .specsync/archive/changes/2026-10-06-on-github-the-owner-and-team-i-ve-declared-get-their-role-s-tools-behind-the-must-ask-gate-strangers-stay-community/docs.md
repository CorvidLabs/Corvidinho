---
change: on-github-the-owner-and-team-i-ve-declared-get-their-role-s-tools-behind-the-must-ask-gate-strangers-stay-community
artifact: docs
---

# Docs

- `docs/WATCH.md`: new "Roles on GitHub (IDENTITY-12.a)" section with the
  who-triggered table (owner / team / everyone else) and what stays the same
  for every role; the identity block, untrusted-text, assigned/requested,
  "What a WATCH run can do", PR review reads and outbound writes paragraphs
  no longer say WATCH runs are always community / never get write tools.
- `docs/discord.md`: roles section — the IDENTITY-12 bullet no longer lists
  WATCH as community, a new "On GitHub too (IDENTITY-12.a)" bullet; the
  must-ask list gains "In a GitHub run you triggered".
- `docs/DISCORD-GO-LIVE.md`: the dangerous-tools paragraph, E.3 entry rules,
  `web-search` / `gif-search` set-up, the delegate / council paragraph, E.6
  roles list and the community-sessions list name WATCH runs by who
  triggered them; WATCH runs hide secret paths for every role.
- Specs: `watch.spec.md` (files list, Purpose, Public API, invariants,
  example), `plugins.spec.md` (Public API `isWatchRunEnv`, role and
  secret-path invariants, scenario, error row), `agent.spec.md` (the
  schedule Fledge invariant extended to WATCH, error row), each module's
  `testing.md`.
- No README, CHANGELOG, STATUS or package.json edit (the release PR writes
  them).
