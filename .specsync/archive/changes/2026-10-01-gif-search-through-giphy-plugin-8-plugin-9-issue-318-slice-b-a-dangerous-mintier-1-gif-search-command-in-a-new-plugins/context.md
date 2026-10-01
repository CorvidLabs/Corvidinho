---
change: gif-search-through-giphy-plugin-8-plugin-9-issue-318-slice-b-a-dangerous-mintier-1-gif-search-command-in-a-new-plugins
artifact: context
---

# Context

Build brief: issue #318 and the orc comment on it (Leif's decisions and
file:line notes, 2026-09-30). This change is PR B of two: `gif-search` on
GIPHY (PLUGIN-8, PLUGIN-9), stacked on PR A (`feat/web-search-brave`, head
d768396, change
`web-search-through-brave-plugin-7-plugin-9-issue-318-a-dangerous-mintier-1-web-search-command-in-plugins-web-offered`),
whose keyed JSON GET (`plugins/web/api.ts`, REQ-plugins-3181) it reuses.

HI captured in this change with the `hi` CLI, verbatim (Leif re-confirmed it
on 2026-09-30 because Tenor is shut down; it replaces the Tenor wording in the
#318 body, which was never captured):

- PLUGIN-8: "It can find a GIF through GIPHY, with the safety filter at
  medium, and post it as a link when asked."

PLUGIN-9 ("Web search and GIF search are for me and the team only, and stay
off until I allow them, like web-fetch.") was captured by PR A and applies
here unchanged.

Leif's decisions used here (#318 orc comment and the slice B brief): GIPHY,
not Tenor (Tenor stopped new keys on 2026-01-13 and ended every API agreement
on 2026-06-30); the safety filter at medium; a GIF is posted as a link only,
never downloaded and never attached with `discord-send-file` (GIPHY's terms
forbid caching or re-hosting media and require "Powered By GIPHY"); GIPHY
calls are free-tier and are recorded at $0 against the SAFE-8 total cap
unless the ledger needs a nonzero entry (it does not: `reserveFlatSpend`
takes 0, so this change records a $0 row); the gating follows web-fetch
(`dangerous: true`, `minTier: 1`, SAFE-1 allowlist, SAFE-5 audit, owner and
team through the explicit `TEAM_SEARCH_TOOLS` rule, community never).

Constraints: no network in `bun test` (fake resolver and transport); no key
anywhere in the repo (fake keys only; fledge-plugin-gif's hardcoded Google
key was not read into or copied anywhere); the must-ask gate (#319, on main)
is another session's work: `gif-search` never posts, so `mustAsk` stays
unset (AUTONOMY-11) and this change does not touch that gate. `web-fetch`
keeps its behaviour for any public host, and `web-search` keeps its
behaviour except that a flag given twice is now a usage error (a review
finding: before, the last value silently won); both have shorter
descriptions (see the budget note below).

Provider research (developers.giphy.com, 2026-09-30): the native search is
`GET https://api.giphy.com/v1/gifs/search` (`api_key`, `q` up to 50
characters, `limit`, `rating` = g | pg | pg-13 | r, all ratings when
unset); its docs do not say whether `rating=pg` also returns G. The
Tenor-compatible layer is `GET https://api.giphy.com/v2/search` (`key`,
`q`, `client_key`, `limit` default 20 max 50, `media_filter`,
`contentfilter` default off) and documents the mapping "off - G, PG, PG-13,
R; low - G, PG, PG-13; medium - G, PG; high - G"; known errors can come back
as HTTP 200 with an `error` field. This change uses the Tenor-compatible
layer because `contentfilter=medium` is Leif's "safety filter at medium"
word for word with a documented meaning (G and PG). Media links are
expected on GIPHY's CDN shards (`media.giphy.com`, `media0`-`media4.giphy.com`,
`i.giphy.com`); GIPHY's Tenor-migration guide names no media hostnames, so
this list is an assumption the live smoke must confirm, and a result left
out for its link is counted and said (`data.dropped` and a summary line) so
a wrong list shows instead of quietly emptying every search. A new key is a
beta key limited to 100 calls an hour.

Tool-surface budget: with `gif-search`, every builtin (all three language
runners on PATH) plus the small fake Fledge plugin in
`tests/fledge.plugins.test.ts` is about 8076 tokens, over the 8000 default
budget (REQ-plugins-114) by ~76. The tool definition's shared `argv` schema
alone is ~60 tokens, so no `gif-search` fits under 8000 (the base was at
7973). The budget (FLEDGE-5 / PLUGIN-6, REQ-plugins-114) is Leif's number, so
this change keeps it at 8000: the `web-fetch` and `web-search` descriptions
say the same rules in fewer words, and `gif-search`'s own is short, bringing
the total to 7991 (measured the same way). If Leif prefers a higher budget
to trimmed descriptions, that is his call.

Ordering and approval: this change depends on PR A's change (`specsync
change depend`), because every REQ both modify here starts from PR A's
text. `specsync change check` for this change refuses to start until PR A's
change is accepted ("dependency … is draft"), so PR A's definition goes
first. The #318 orc comment (Leif's latest decisions) says SpecSync
definition approvals are recorded only on Leif's go, and PR A's definition
is still a draft for that reason. This definition stays a draft too, with no
approval recorded: once Leif gives his go on #318 (after PR A's), the
approval is recorded with actor corvid-agent (the repo's approving actor,
PROCESS-3) and a note citing that comment. Nothing is recorded as Leif.
