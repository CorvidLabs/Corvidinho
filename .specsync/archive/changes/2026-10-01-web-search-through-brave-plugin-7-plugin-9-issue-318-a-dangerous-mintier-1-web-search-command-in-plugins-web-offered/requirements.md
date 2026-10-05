---
change: web-search-through-brave-plugin-7-plugin-9-issue-318-a-dangerous-mintier-1-web-search-command-in-plugins-web-offered
artifact: requirements
---

# Requirements

Confirmed HI captured in this change (hi CLI, verbatim): **PLUGIN-7** and
**PLUGIN-9** (see context). SAFE-1, SAFE-5, SAFE-6, SAFE-7, SAFE-8, SAFE-12,
SAFE-13, SAFE-14.a, IDENTITY-10/11 and AUTONOMY-11 apply unchanged.

Canonical requirements (see deltas):

- Added **REQ-agent-318**: a reply whose run got an answer from Brave ends
  with the visible line "Search by Brave" once (Leif's go on #318, to meet
  Brave's terms): a closing note added by `createTaskExecute`, kept by every
  clip, never in anything the model reads or in the owner's spend DMs.

- Added **REQ-plugins-318**: the `web-search` command (registration and
  gating, args, key, SAFE-6 query check, SAFE-8 reservation, the Brave
  request, error mapping, fenced output, nothing carries the key or the URL).
- Added **REQ-plugins-3181**: the keyed JSON GET (`apiGetJson`): https only,
  per-command host allowlist and default port before DNS, the web-fetch
  pinned address guard, redirects refused, JSON-only capped bodies, one
  deadline, abort, never the URL.
- Modified **REQ-plugins-111**: the "no `web-search` command exists"
  acceptance line becomes "a separate command, web-fetch unchanged"; the pin
  and dial helpers are shared.
- Modified **REQ-plugins-065**: `TEAM_SEARCH_TOOLS` (`web-search`) for team
  (PLUGIN-9); `web-fetch` stays the owner's.
- Modified **REQ-plugins-113**: the Fledge child env drops
  `BRAVE_SEARCH_API_KEY`.
- Modified **REQ-agent-002** / **REQ-agent-117**: the delegate worker drop
  list (and so the verify lane, shell and runners) drops
  `BRAVE_SEARCH_API_KEY`.
- Modified **REQ-agent-071**: `web-search` is in `INJECTION_SCAN_TOOLS` and
  keeps its own fence; a hit drops the web tools too.
- Modified **REQ-agent-086**: `web-search` is in `NO_STATE_CHANGE_TOOLS`.
- Modified **REQ-agent-098**: flat-priced tool calls (`reserveFlatSpend`,
  `PluginHandlerResult.spendAsk`) count toward the SAFE-8 total cap (recorded
  while any SAFE-14 cap is set, stopped while a setting is not valid) and end
  the attempt with the spend-cap ask like a model call.
- Modified **REQ-discord-417**: `BRAVE_SEARCH_API_KEY` is a SAFE-6 secret
  env name (`formatErrorLine`, `redactSecretEnvValues`).
- Modified **REQ-cli-262**: the test preload unsets `BRAVE_SEARCH_API_KEY`.

The modified REQ-agent-002, REQ-agent-086, REQ-agent-098, REQ-cli-262 and
REQ-plugins-065 texts start from main 0aeb345's canonical text (#320, #321,
#328, #329 and #330 changed them), so the deltas keep main's lines and add
only this change's. The other modified REQs are unchanged on main since
156cfa9. REQ-plugins-318 now says schedules other people create never get
`web-search` (a schedule the owner created runs as the owner,
DISCORD-SCHEDULE-1.a).
