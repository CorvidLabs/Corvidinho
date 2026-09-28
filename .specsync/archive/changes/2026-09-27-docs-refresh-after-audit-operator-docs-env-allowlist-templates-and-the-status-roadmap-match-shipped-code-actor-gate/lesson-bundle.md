# Lesson bundle — docs-refresh-after-audit-operator-docs-env-allowlist-templates-and-the-status-roadmap-match-shipped-code-actor-gate

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Docs refresh after audit: operator docs, env/allowlist templates and the STATUS roadmap match shipped code (actor gate, requester ping, fail-closed allowlist file, 0.0.21-0.0.27 slices)
- **Kind**: Documentation
- **Paths**: AGENTS.md, README.md, STATUS.md, CHANGELOG.md, docs/DISCORD-GO-LIVE.md, docs/BOX-UPDATE.md, docs/UPDATE.md, docs/WATCH.md, docs/discord.md, docs/DAEMON.md, allowlist.example.toml, .env.example, tests/docs.operator-facts.test.ts
- **Acceptance**: Every stale or wrong fact from the docs audit that is still true on main is corrected in AGENTS.md, README.md, STATUS.md, CHANGELOG.md (factual fixes only), docs/DISCORD-GO-LIVE.md, docs/BOX-UPDATE.md, docs/UPDATE.md, docs/WATCH.md, docs/discord.md, docs/DAEMON.md, allowlist.example.toml and .env.example; every command and env name they cite exists in code; tests/docs.operator-facts.test.ts fails on the old docs and passes on the new ones

## Evidence

- Verification commit: `f3cab7e909caccf7ab46b7ca761bef0eb920ce23`
- Base commit: `dbe37ce53abf815e39aa7a614b0361d9332bc0d4`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

A docs audit against `origin/main` at a422b6a (#191, package 0.0.22) and the
bridge end-to-end report ("Doc drift in docs/discord.md") found stale, wrong
and missing facts in the operator docs and templates: the slash gate order left
out the actor gate (REQ-discord-201), the ask-ping text said every ask mentions
the owner (AUTONOMY-4 says clarify addresses the requester), templates said
empty user/role lists are deny-all (both empty = anyone in an allowlisted
channel), dry-run was documented as working without a token, schema v7 instead
of v9, the WATCH spawn log default ignored `CORVIDINHO_DATA_DIR`, `.env.example`
missed every GitHub allowlist and WATCH env var, and STATUS.md still carried
"(this PR)" placeholders, a blank line that broke the ROADMAP table and no rows
for most of 0.0.11..0.0.27.

Main moved from 0.0.22 to 0.0.27 after the audit, so every finding was
re-checked against the code on `dbe37ce` before changing a line. Already fixed
on main and dropped: the CHANGELOG "Unreleased"/0.0.22 hardening gap (now the
0.0.23 section), the allowlist.example.toml multi-line warning (#203 made
multi-line arrays load), and the bridge report's "replying to a /work or
/session start ask does not continue the session" drift (#216). New facts from
the shipped slices are documented instead: a malformed allowlist file refuses
start and fails doctor (#203), daemon shutdown kills abandoned runs' process
trees (#185), interrupted replies (#194), `/status` spend line (SAFE-8).

No new HI and no behavior change: every command and env name cited exists in
`src/`, `plugins/` or `scripts/` (the new test checks `.env.example` both ways).
CHANGELOG version sections and package.json are untouched; only factual errors
inside existing CHANGELOG text were corrected.

## From the change's design.md

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

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
