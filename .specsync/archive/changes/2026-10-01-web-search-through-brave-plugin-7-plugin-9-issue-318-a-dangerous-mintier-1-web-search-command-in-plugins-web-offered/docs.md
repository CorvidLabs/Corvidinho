---
change: web-search-through-brave-plugin-7-plugin-9-issue-318-a-dangerous-mintier-1-web-search-command-in-plugins-web-offered
artifact: docs
---

# Docs

- `.env.example`: `BRAVE_SEARCH_API_KEY` block (env only, no default, off
  until allowlisted, owner and team only, safesearch moderate, ~$0.005 per
  search toward the cap, prepaid usage limit, never passed to workers / verify
  / shell / runners / Fledge); the `CORVIDINHO_ALLOWLIST` note says team also
  gets the review tools and `web-search`.
- `docs/DISCORD-GO-LIVE.md`: E.3 table row for `web-search`; the E.3 table
  intro and its "What an entry unlocks" role bullet say team members' Discord
  runs get `github-issue-comment`, `github-pr-review` and `web-search`; new
  E.3.a (turn it on, the exact not-configured error, what one search does,
  SAFE-7 / SAFE-13 / SAFE-6 / SAFE-8 and SAFE-14 / SAFE-5; the "Search by
  Brave" reply line on Leif's go, where it shows and where it never does; one
  question stays open for Leif: quoted results kept in chat history under
  Brave's terms; the owner's own schedules get it, others' never);
  the E.6 team bullet and E.6 community catalog name it.
- `docs/discord.md`: the Team role bullet names `web-search` (allowlisted,
  PLUGIN-9; `web-fetch` stays the owner's); the SAFE-13 tool list names
  `web-search` and that one suspicious snippet switches off both web tools;
  the long-answer paragraph keeps the "Search by Brave" line whole in the
  last message, and names it as the only provider line.
- `src/discord/rich-reply.ts`: the `splitDiscordMessage` comment names the
  line among the closing notes.
- `specs/plugins/plugins.spec.md`, `specs/agent/agent.spec.md`: files lists,
  public API, invariants, a scenario, error rows; testing companions.
  Requirements through the deltas. No CHANGELOG / STATUS / version edits (a
  release does those). The fledge-gif install note from #318 is dropped:
  Tenor is shut down (orc comment), and PR B builds GIF search on GIPHY.
