---
change: web-search-through-brave-plugin-7-plugin-9-issue-318-a-dangerous-mintier-1-web-search-command-in-plugins-web-offered
artifact: tasks
---

# Tasks

- [x] HI: PLUGIN-7, PLUGIN-9 captured verbatim (`hi`), INTENT.md index.
- [x] `plugins/web/fetch.ts` helpers exported (web-fetch unchanged).
- [x] `plugins/web/api.ts` keyed JSON GET.
- [x] `plugins/web/search.ts` + `web-search` in `plugins/web/commands.ts`.
- [x] `TEAM_SEARCH_TOOLS` (`src/plugins/roles.ts`).
- [x] `INJECTION_SCAN_TOOLS`, tool-call payload names, `NO_STATE_CHANGE_TOOLS`.
- [x] `reserveFlatSpend`, `PluginHandlerResult.spendAsk`, tool-loop stop.
- [x] Key lists: `WORKER_ENV_DROP`, Fledge `DROP_KEYS`, `SECRET_ENV_NAMES`, `tests/preload.ts`.
- [x] Tests: `tests/web.search.test.ts` (new); `tests/web.fetch.test.ts`, `tests/roles.team.test.ts`, `tests/preload.operator-data-dir.test.ts` + probe updated.
- [x] Docs: `.env.example`, `docs/DISCORD-GO-LIVE.md`, `docs/discord.md`.
- [x] Spec: deltas, `plugins.spec.md` / `agent.spec.md` prose and files, testing companions.
- [x] Rebased onto main 507d97b; REQ-agent-002 / REQ-cli-262 deltas regenerated from main's text.
- [x] Review fixes: secret scrub last (results and error lines), split-key tests, query words with `--query` refused, abort / timeout / body-read / 403 / unexpected / settle / unavailable-ledger tests, exact not-configured error text, docs role and attribution wording.
- [x] Fail-on-main proof on a main 507d97b worktree; `hi check`; `specsync check --require-coverage 100`.
- [x] Rebased onto main 0aeb345; REQ-agent-002 / -086 / -098, REQ-cli-262 and REQ-plugins-065 deltas regenerated from main's text.
- [x] `reserveFlatSpend` reads every spend-cap setting (SAFE-14): recorded while any cap is set, counted against the total cap only, stopped while a setting is not valid; test.
- [x] Owner's own schedules get `web-search` (DISCORD-SCHEDULE-1.a), others' never: docs, spec text, test.
- [x] "Search by Brave" reply line (REQ-agent-318, Leif's go): `REPLY_ATTRIBUTION_BY_TOOL`, `withReplyAttribution`, `closingNotesTail` in `src/agent/task-summary.ts`; the tool loop reports an answered search and `createTaskExecute` adds the line; tests; docs.

## Not done yet (outside this branch's code)

`change check` needs every task above done, so these are listed as plain
items, not as tasks:

- `bun test` and the fledge verify lane green on Linux CI or the VPS. On
  macOS only the Linux-only failures remain, the same set as untouched main
  0aeb345 (names in testing.md).
- A live smoke on the VPS or Linux with a real key and a spend cap set: one
  search, and its ledger row settles `actual` at 5000 micro-USD.
