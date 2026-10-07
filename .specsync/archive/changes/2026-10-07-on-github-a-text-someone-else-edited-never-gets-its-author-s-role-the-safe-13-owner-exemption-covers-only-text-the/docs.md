---
change: on-github-a-text-someone-else-edited-never-gets-its-author-s-role-the-safe-13-owner-exemption-covers-only-text-the
artifact: docs
---

# Docs

- `docs/WATCH.md`: "Roles on GitHub" gains an "Edited text" paragraph; the
  owner row no longer lists `git-push` as a must-ask example and points at
  the checkout rule; "What stays the same for every role" adds the checkout
  writes and the `github:<id>` audit actor; "Untrusted text" says SAFE-13
  checks every part the owner did not write.
- `docs/discord.md`: the "On GitHub too" bullet (edited text, checkout
  writes, audit actor) and the must-ask "In a GitHub run you triggered"
  bullet (no `git-push` there).
- `docs/DISCORD-GO-LIVE.md`: the E.6 IDENTITY-12.a bullet.
- Specs: `watch.spec.md` (files, Purpose, Public API, invariants),
  `plugins.spec.md` (Public API, role invariant), each module's
  `requirements.md` and `testing.md`.
- No README, CHANGELOG, STATUS or package.json edit (the release PR writes
  them).
