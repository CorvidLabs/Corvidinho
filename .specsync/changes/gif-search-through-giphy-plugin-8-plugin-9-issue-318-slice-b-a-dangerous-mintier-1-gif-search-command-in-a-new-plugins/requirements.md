---
change: gif-search-through-giphy-plugin-8-plugin-9-issue-318-slice-b-a-dangerous-mintier-1-gif-search-command-in-a-new-plugins
artifact: requirements
---

# Requirements

Confirmed HI captured in this change (hi CLI, verbatim): **PLUGIN-8** (see
context). PLUGIN-9 (captured by PR A), SAFE-1, SAFE-5, SAFE-6, SAFE-7, SAFE-8,
SAFE-12, SAFE-13, SAFE-14.a, IDENTITY-10/11, FLEDGE-5 and AUTONOMY-11 apply
unchanged.

Canonical requirements (see deltas):

- Added **REQ-plugins-3182**: the `gif-search` command (registration and
  gating, args with no way to change the filter, key, SAFE-6 query check,
  SAFE-8 $0 reservation, the GIPHY request with `contentfilter=medium`,
  error mapping, media-host validation, fenced output with the link-only
  guidance and "Powered By GIPHY", nothing carries the key or the request
  URL).
- Modified **REQ-plugins-065**: `TEAM_SEARCH_TOOLS` is `web-search` and
  `gif-search` (PLUGIN-9); `web-fetch` and `discord-send-file` stay the
  owner's.
- Modified **REQ-plugins-113**: the Fledge child env drops `GIPHY_API_KEY`.
- Modified **REQ-plugins-114**: the default tool-surface budget is ~8500
  tokens (was ~8000).
- Modified **REQ-agent-002** / **REQ-agent-117**: the delegate worker drop
  list (and so the verify lane, shell and runners) drops `GIPHY_API_KEY`.
- Modified **REQ-agent-071**: `gif-search` is in `INJECTION_SCAN_TOOLS` and
  keeps its own fence; a hit drops `gif-search`, `web-search` and
  `web-fetch` too.
- Modified **REQ-agent-086**: `gif-search` is in `NO_STATE_CHANGE_TOOLS`.
- Modified **REQ-agent-098**: a free-tier `gif-search` is recorded at a
  price of 0 through `reserveFlatSpend`.
- Modified **REQ-discord-417**: `GIPHY_API_KEY` is a SAFE-6 secret env name.
- Modified **REQ-cli-262**: the test preload unsets `GIPHY_API_KEY`.

Every modified text starts from PR A's delta text (this change stacks on it
and depends on it), not from main's canonical text, and adds only the GIPHY
parts; REQ-plugins-114 starts from main's canonical text (PR A does not touch
it).
