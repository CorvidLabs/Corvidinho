---
change: gif-search-through-giphy-plugin-8-plugin-9-issue-318-slice-b-a-dangerous-mintier-1-gif-search-command-in-a-new-plugins
artifact: plan
---

# Plan

1. Branch `feat/gif-search-giphy` from PR A's head d768396
   (`feat/web-search-brave`).
2. Capture PLUGIN-8 (the GIPHY text) verbatim with `hi`; `hi index`.
3. Research GIPHY's API (developers.giphy.com): pick the Tenor-compatible
   `/v2/search` for its documented `contentfilter=medium` (G and PG).
4. `plugins/gif` (search core, command, loader) on the keyed JSON GET;
   `loadBuiltins` loads it.
5. Team rule, SAFE-13 scan set and payload names, loop guard, key drop /
   scrub lists, the test preload.
6. Tests: `tests/gif.search.test.ts`; update `tests/roles.team.test.ts`,
   `tests/web.search.test.ts` (team rule), `tests/preload.operator-data-dir.test.ts`
   + probe (preload unset).
7. Tool-surface budget 8000 → 8500 (REQ-plugins-114), measured.
8. Docs (`.env.example`, `docs/DISCORD-GO-LIVE.md` E.3 / E.3.b / E.6,
   `docs/discord.md`), spec prose and testing notes, deltas; declare the
   dependency on PR A's change.
9. `specsync check --require-coverage 100`, `hi check`, `bun test`, fledge
   verify; fail-on-main proof against PR A's head (the base of this branch).
10. Definition approval (actor corvid-agent), `specsync change check
    --commit`; later, after PR A: review and finalize. No push or PR from
    this session; never merge.
