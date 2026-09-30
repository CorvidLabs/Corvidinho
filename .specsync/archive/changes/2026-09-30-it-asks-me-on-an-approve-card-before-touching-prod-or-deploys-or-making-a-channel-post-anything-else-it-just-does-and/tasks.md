---
change: it-asks-me-on-an-approve-card-before-touching-prod-or-deploys-or-making-a-channel-post-anything-else-it-just-does-and
artifact: tasks
---

# Tasks

- [x] Read #97 (body, steal notes, Leif's 2026-09-26 comment, progress comments), Leif's 2026-09-28 interview (rounds 4 and 13), the must-ask-gate synthesis entry and the must-ask rows of the conservative defaults.
- [x] Capture AUTONOMY-9.a and AUTONOMY-10.a with `hi` (own commit); `hi check` passes.
- [x] `src/plugins/types.ts` must-ask types and `PluginCommand.mustAsk`.
- [x] `src/plugins/must-ask.ts` (policy table, kinds, tables, `mustAskVerdict`, `mustAskGate`, notifier, seams) and the gate in `src/plugins/run.ts`.
- [x] Classifiers: `plugins/shell/must-ask.ts` + `shell-exec`; runners; `plugins/fledge/must-ask.ts` + `fledge-run` / `fledge-lanes-run` / discovered commands; `git-push`; `discord-post-message` with the shared `preparePost`.
- [x] `mustAskApprovalKinds` in `src/discord/approval-cards.ts`, registered by `src/discord/bridge.ts`.
- [x] AUTONOMY-11 sentence in `src/agent/ask.ts`; `task run` notifier in `src/cli.ts`.
- [x] Tests: `tests/must-ask.gate.test.ts`, `tests/must-ask.classify.test.ts`, `tests/must-ask.boundary.test.ts`, `tests/must-ask.regression.test.ts`, `tests/fixtures/must-ask.ts`; existing post and push tests approve the card. Fail on base (151e9ba), pass here.
- [x] Docs (`docs/discord.md`, `docs/DISCORD-GO-LIVE.md`), spec prose and `files:`, testing companions, deltas (Added REQ-plugins-097, REQ-discord-097, REQ-agent-097, REQ-cli-097).
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
