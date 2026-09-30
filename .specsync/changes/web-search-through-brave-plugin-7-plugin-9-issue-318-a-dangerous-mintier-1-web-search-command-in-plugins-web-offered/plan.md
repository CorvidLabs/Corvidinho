---
change: web-search-through-brave-plugin-7-plugin-9-issue-318-a-dangerous-mintier-1-web-search-command-in-plugins-web-offered
artifact: plan
---

# Plan

1. Capture PLUGIN-7 and PLUGIN-9 verbatim with `hi`; `hi index`.
2. Share the web-fetch pin / dial / read helpers; add the keyed JSON GET.
3. `web-search` (search core, command, team rule, SAFE-13 scan, loop guard).
4. SAFE-8 flat reservation and the tool-loop spend-cap stop.
5. Key drop / scrub lists and the test preload.
6. Tests: `tests/web.search.test.ts`; update `tests/web.fetch.test.ts`
   (web-search exists), `tests/roles.team.test.ts` (team rule),
   `tests/preload.operator-data-dir.test.ts` + probe (preload unset).
7. Docs (`.env.example`, `docs/DISCORD-GO-LIVE.md` E.3 / E.3.a / E.6,
   `docs/discord.md`), spec prose and testing notes, deltas.
8. `specsync check --require-coverage 100`, `hi check`, `bun test`, fledge
   verify; fail-on-main proof on a main worktree; draft PR.
9. On Leif's go (orc comment on #318: definition approvals only on his go):
   `specsync change approve` (actor corvid-agent, a note linking the go),
   `specsync change check --commit`, `specsync change review --reviewer
   corvid-agent`, `specsync change finalize`; green Linux CI; then ready for
   review. Never merge before finalize.
