---
change: prompt-injection-hygiene-display-names-are-cleaned-before-the-model-sees-them-and-a-name-that-imitates-the-owner-or-a
artifact: tasks
---

# Tasks

- [x] Confirm SAFE-11/12/13 are captured on main (`hi/safe.md`, landed with #270); `hi check` green; nothing to capture again.
- [x] Map every surface that puts third-party text or a display name into a prompt (research.md).
- [x] `src/agent/untrusted.ts`: `cleanDisplayName`, `nameSkeleton` / `namesLookAlike`, `stripInvisible`, `defangContextMarkers`, `fenceUntrustedData`, `detectInjection` (six reason ids, bounded), notice validation and formatters, `UNTRUSTED_CONTENT_AGENT_SYSTEM_INSTRUCTIONS`; `plugins/web/text.ts` fence on the shared helper.
- [x] `src/agent/execute.ts`: SAFE-11 / SAFE-12 system paragraphs (tool loop and read tier); tool-result fence (`UNTRUSTED_RESULT_TOOLS`) and scan (`INJECTION_SCAN_TOOLS`); mutating tools dropped and refused after a hit; `injection-suspected` audit row; `onInjection`; `withInjectionNote`. `src/agent/types.ts` / `src/cli.ts`: `TaskResult.injection`.
- [x] Discord: `identity-inject.ts` (`cleanedDiscordName`, `displayNameClash`, `name_clash` line); `injection-guard.ts`; bridge chat (role before the run, refusal, fence, owner notice on chat and button-pick replies); `/session start` and `/work` (refusal before any session, fence, `slashOwnerNotice` `injection`); schedule posts; session-thread and memory lines; spawn client `injection`.
- [x] WATCH: `router.ts` (fenced title / body within the cap, `watchInjectionVerdict`), `ack.ts` (refusal comment), `summary.ts` (owner line), `poller.ts` (refuse before ack / run, audit, log), `agent-client.ts` / `types.ts` (`injection`). `plugins/discord/user-lookup.ts` cleans names.
- [x] Tests: `tests/safe.injection.test.ts` (64); `tests/discord.slash-pending-ask.test.ts` expects a non-owner's answer inside the fence; fail-on-base proof with the base sources swapped in (file fails to load; a behavioural copy on base exports fails 9/9; the updated pending-ask test fails 3/12), all pass on the branch.
- [x] Docs: `docs/discord.md` (new "Untrusted text and injection attempts" section, source map, criteria line), `docs/WATCH.md`, `docs/DISCORD-GO-LIVE.md` (E.6.a, E.7 audit row); spec prose, `files:` and testing for `agent`, `discord`, `watch`, `plugins`, `cli`; deltas Added REQ-agent-071 / REQ-discord-071 / REQ-watch-071 / REQ-plugins-071 / REQ-cli-071, Modified REQ-discord-036 / REQ-watch-036.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
