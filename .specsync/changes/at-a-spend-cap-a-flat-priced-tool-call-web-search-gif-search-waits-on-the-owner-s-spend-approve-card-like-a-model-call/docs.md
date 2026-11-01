---
change: at-a-spend-cap-a-flat-priced-tool-call-web-search-gif-search-waits-on-the-owner-s-spend-approve-card-like-a-model-call
artifact: docs
---

# Docs

- `docs/discord.md`: the must-ask table's spend row names `web-search` /
  `gif-search` past the total cap; "The spend card" intro and a new bullet
  ("A search past the total cap asks the same way") with the action, target,
  amount, one-call approval and the `corvidinho plugins run` exception.
- `docs/DISCORD-GO-LIVE.md`: the E.1 spend-card bullet names the held
  search; the Brave and GIPHY spend bullets say a search past the cap first
  asks on the owner's card (they said it just stopped).
- Specs: `specs/agent/agent.spec.md` (Public API: `reserveFlatSpend`,
  `flatCard`, `spendCardFields({ tool })`, the tool loop's `spendCard`;
  invariant; scenario; error rows), `specs/plugins/plugins.spec.md` (Public
  API `PluginHandlerArgs.spendCard`, web-search and gif-search spend text,
  scenario, error rows, dependency row), both `testing.md` evidence
  sections; REQ-agent-398 and REQ-plugins-398 added, REQ-agent-098 modified
  through the deltas.
- No README, STATUS, CHANGELOG, `.env.example` or package.json edit (nothing
  there is made false; the release PR writes the release notes).
