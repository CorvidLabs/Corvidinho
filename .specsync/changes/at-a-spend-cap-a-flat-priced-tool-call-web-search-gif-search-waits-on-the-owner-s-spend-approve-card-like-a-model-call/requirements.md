---
change: at-a-spend-cap-a-flat-priced-tool-call-web-search-gif-search-waits-on-the-owner-s-spend-approve-card-like-a-model-call
artifact: requirements
---

# Requirements

- SAFE-8 (on main, `hi/safe.md`): "When a daily spend cap is set, I get a
  warning at 80% of it, and at 100% the agent asks me (an Approve card to
  continue) instead of refusing or quietly running up the bill."
- SAFE-8.a (on main): "One Approve and its code let only the paused call
  through, at the amount shown; the next call past the cap raises a new card
  and code."
- Also governing (on main): SAFE-14.a (only the owner sees amounts and cap
  settings), SAFE-18 (the DM card shows the exact action, target and
  amount), SAFE-19 (money actions need the one-time code), SAFE-20 (no
  answer, or a late one, means no).
- Leif's #318 go (2026-09-30 22:40) adopted #334's REQ-agent-098 wording:
  "the run waits for the owner's spend Approve card".
- Added: REQ-agent-398 (a flat-priced call past the total cap waits on the
  run's spend card), REQ-plugins-398 (the run's card reaches `web-search` and
  `gif-search`).
- Modified: REQ-agent-098 (`reserveFlatSpend` takes the run's card and is
  `held` on an approval; stopped otherwise, as before).
- Kept: REQ-agent-198 (the model call's card), REQ-agent-199 (unknown
  prices), REQ-plugins-318 / REQ-plugins-3182 (a stopped reservation's
  result).
- No env var, config key, table, schema, CLI command or package version
  change.
