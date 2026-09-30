---
change: scheduled-runs-read-and-act-only-on-repos-the-owner-allowlists-even-public-ones-discord-schedule-3-a-in-a-schedule-run
artifact: docs
---

# Docs

- `docs/discord.md`: Session worktrees table — the "Explicit project" row
  (nested checkout needs an allowlisted origin for schedules), a new "Schedule
  repos" row (GitHub tools, review and docs readers, web-fetch GitHub hops,
  workers inherit), and an upgrade note (existing schedules on a
  non-allowlisted nested checkout start failing at their next tick; allowlist
  the repo or delete the schedule); the roles "Checked in the tool layer"
  bullet points at it.
- `docs/DISCORD-GO-LIVE.md`: a scheduled-runs bullet under the daemon notes
  and a qualifier on "Public Q&A (ROLES-CHAT-8)".
- `docs/WATCH.md`: the PR review readers paragraph notes scheduled runs use
  allowlisted repos only.
- Specs: `plugins.spec.md` (Public API, the schedule-run paragraph, a
  scenario, two error rows, the new test in `files`), `discord.spec.md` (a
  paragraph, a scenario, an error row), both `testing.md` companions;
  requirements through the deltas.
- README, STATUS and `docs/DAEMON.md` say nothing this makes false. No
  CHANGELOG / version edits.
