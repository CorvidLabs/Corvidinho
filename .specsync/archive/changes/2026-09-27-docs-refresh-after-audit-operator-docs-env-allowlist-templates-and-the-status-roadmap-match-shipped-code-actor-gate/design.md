---
change: docs-refresh-after-audit-operator-docs-env-allowlist-templates-and-the-status-roadmap-match-shipped-code-actor-gate
artifact: design
---

# Design

Docs-only edits, each re-verified against the code on main:

- Gate order and ask pings: `src/discord/slash-dispatch.ts` (channel → actor
  gate → mute/rate → minPermission → handler), `src/discord/ask-ping.ts`
  (`formatAskReply`: clarify → requester, stuck/spend-cap → owner),
  `src/scheduler/service.ts` (schedule creator for clarify).
- Allowlist semantics: `src/discord/permissions.ts` `resolvePermissionLevel` /
  `gateActor` (both lists empty ⇒ STANDARD; owner-only ADMIN),
  `src/allowlist/load.ts` (fail closed), `src/allowlist/github.ts` (`OWNER/*`).
- Startup/doctor: `src/discord/config.ts` (token required even in dry-run;
  `DISCORD_BOT_TOKEN` wins), `src/watch/config.ts` (`GITHUB_TOKEN` wins, env
  names, `CORVIDINHO_WATCH_MAX_TRIGGERS`), `src/cli.ts` doctor checks incl.
  `allowlist-file`, `scripts/corvidinho-update.sh` (fetch/prune, dry-run, env
  file), `src/store/db.ts` `SCHEMA_VERSION` 9.
- Tools: `src/agent/tools.ts` (dangerous tools never in the `task run`
  catalog), `plugins/autonomous/council.ts` (mutating, autonomous extra).

Regression guard: `tests/docs.operator-facts.test.ts` reads each fact from the
code (slash names, schema version, permission levels, ask mentions, spawn-log
path, doctor check names, mutating non-dangerous tools, loader env names, hi/
families) and asserts the docs state it. 15 of its 21 tests fail on the old
docs and all 21 pass on the new ones; the 6 that passed before are the
code-truth checks and the "no invented env name" guard.
