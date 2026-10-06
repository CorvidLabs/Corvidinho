---
change: it-can-merge-its-own-corvidinho-pr-when-i-ask-and-every-gate-is-green-never-its-gates-never-someone-else-s-github-7
artifact: tasks
---

# Tasks

- [x] Capture GITHUB-7.a with `hi` from the 2026-09-28 interview record (round 16); `hi check` passes.
- [x] `src/plugins/types.ts`: `MustAskClass` gains `merge`; `PluginHandlerResult.auditDenied`.
- [x] `src/plugins/must-ask.ts`: `MUST_ASK_POLICY.merge`, `MUST_ASK_MERGE_KIND`, card title / amount, card refusals set `auditDenied`.
- [x] `src/plugins/run.ts`: `<command>:<reason>` `denied` rows for held and handler refusals that name a reason.
- [x] `plugins/github/merge.ts`: caller check (WATCH by session id and surface stamp, the owner's own included), gate paths (`.trust.toml` and the wider gate code list), `checkSelfMerge`, classifier, handler; registered in `plugins/github/index.ts`.
- [x] Readiness: refuse unless a person (never its own token or an app) marked the PR ready (`not-marked-ready`), so a PR it opened ready waits for a human too (round 13).
- [x] `src/agent/tools.ts` / `execute.ts`: `SELF_MERGE_TOOLS`, `selfMerge` grant, one operator line; `loop-guards.ts`, `events-ndjson.ts`, `ask.ts`.
- [x] `tests/github.self-merge.test.ts` (fake GitHub client; the owner's GitHub-triggered WATCH run refused and not offered); `tests/must-ask.boundary.test.ts` list; fail-on-base proof on 86d68cd0 recorded in testing.md.
- [x] Docs (docs/discord.md, docs/DISCORD-GO-LIVE.md, docs/WATCH.md, README.md), spec prose, deltas, module testing evidence.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
