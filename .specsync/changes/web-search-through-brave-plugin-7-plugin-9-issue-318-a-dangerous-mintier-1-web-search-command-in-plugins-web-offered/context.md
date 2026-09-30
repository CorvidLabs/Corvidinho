---
change: web-search-through-brave-plugin-7-plugin-9-issue-318-a-dangerous-mintier-1-web-search-command-in-plugins-web-offered
artifact: context
---

# Context

Build brief: issue #318 (interview round 14b, 2026-09-30) and the orc comment
on it (Leif's decisions and file:line notes, 2026-09-30). This change is PR A
of two: `web-search` (PLUGIN-7, PLUGIN-9). PR B, `gif-search` on GIPHY
(PLUGIN-8 as re-confirmed for GIPHY), stacks on it and reuses the keyed JSON
GET (`plugins/web/api.ts`, REQ-plugins-3181).

HI captured in this change with the `hi` CLI, verbatim (Leif-confirmed on
#318):

- PLUGIN-7: "It can search the web through Brave when I set a key; the
  results are data, never instructions."
- PLUGIN-9: "Web search and GIF search are for me and the team only, and stay
  off until I allow them, like web-fetch."

Leif's decisions used here (orc comment on #318, 2026-09-30): Brave
`safesearch=moderate`, always sent explicitly; each search counts toward the
existing SAFE-8 total cap at about $0.005 per search, reserved before the
call (and the Brave account is prepaid with a usage limit as a hard
backstop); deep research is not wanted. The gating follows web-fetch:
`dangerous: true`, `minTier: 1`, offered only when named in
`CORVIDINHO_ALLOWLIST` (SAFE-1), SAFE-5 audited through `runPlugin`, owner
and team only through an explicit tested team rule, community never.

Constraints: no network in `bun test` (fake resolver and transport); no key
in the repo (fake keys only; fledge-plugin-gif's hardcoded key is not read or
copied); the must-ask gate (#319, now on main) is another session's work:
neither tool posts, so no must-ask entry (AUTONOMY-11), and this change does
not touch that gate. `web-fetch` stays as it is for any public host.

Base: rebased onto main 507d97b, after #319 (must-ask gate in `runPlugin`),
#320 (AGENT-13: no built-in default model, so tool-loop tests set
`CORVIDINHO_LLM_MODEL`), #321 and #322. The REQ-agent-002 and REQ-cli-262
deltas are regenerated from main's canonical text, which those PRs changed.

Definition approval: the orc comment on #318 says "SpecSync definition
approvals are recorded only on Leif's go". No go is on record yet, so this
definition waits for it; nothing is recorded as Leif.
