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

Base: rebased onto main 0aeb345, after #319 (must-ask gate in `runPlugin`),
#320 (AGENT-13: no built-in default model, so tool-loop tests set
`CORVIDINHO_LLM_MODEL`), #321, #322, #323, #324 (SAFE-3.a), #325 (AGENT-11
model fallback), #327 (v0.0.36), #328 (SAFE-14 / SAFE-15 per-provider spend
caps), #329 (AGENT-18 SpecSync change tools) and #330 (DISCORD-SCHEDULE-1.a:
a schedule the owner created runs as the owner), then onto main 81ceb4a
(#332 AGENT-3.a / AGENT-3.b run queue and stop, #333), which changed none of
this change's requirements. The modified REQ-agent-002,
REQ-agent-086, REQ-agent-098, REQ-cli-262 and REQ-plugins-065 deltas start
from main 0aeb345's canonical text (those PRs changed all five), so they keep
main's lines and add only this change's. After #328, `reserveFlatSpend`
reads every spend-cap setting (`parseSpendCaps`): a search is recorded while
any cap is set and counts against the total cap only, since a SAFE-14
provider cap is keyed on a configured model provider. After #330 the owner's
own schedules run as the owner, so they get `web-search` when it is
allowlisted; schedules other people create still never do.

Leif's go (2026-09-30, https://github.com/CorvidLabs/Corvidinho/issues/318#issuecomment-5918616747): approve this definition (and
gif-search's, #331) as `corvid-agent` per PROCESS-3; replies that used web
search end with a short visible attribution line, "Search by Brave", to meet
Brave's terms. That line is implementation to meet the provider's terms, not
a new `hi` criterion: it is REQ-agent-318 in this change's deltas, so the
approved definition covers it. It is added by the reply path as a closing
note (the pattern of the AGENT-11 fallback note and the ROLES-CHAT-3 role
note), never inside the fence or a tool result, and never in the owner's
spend DMs. Merge order: #326, then #331.

Definition approval: recorded as `corvid-agent` on that go, with the go's
link as the note; nothing is recorded as Leif.
