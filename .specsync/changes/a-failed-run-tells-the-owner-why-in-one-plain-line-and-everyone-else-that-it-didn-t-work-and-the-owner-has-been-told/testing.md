---
change: a-failed-run-tells-the-owner-why-in-one-plain-line-and-everyone-else-that-it-didn-t-work-and-the-owner-has-been-told
artifact: testing
---

# Testing

Stub agents, a dry-run bridge whose gateway stub records replies and
`sendDm`, in-memory SQLite, a `SchedulerService` with a recording poster,
fake `corvidinho` sh bins for the spawn client, and the real CLI against a
localhost provider that answers 401. No network, no real key or token, and no
test runs the repo's own verify lane.

Fail-on-base proof: with the base's (9ea4005) twelve modified source files
swapped in (`src/agent/{events-ndjson,execute,loop,providers,types}.ts`,
`src/discord/{agent-client,bridge,slash-types,types}.ts`,
`src/discord/command-handlers/{session,work}.ts`,
`src/scheduler/service.ts`; the new `src/discord/failure-reason.ts` kept so
imports resolve), `bun test tests/discord.failed-reply.test.ts` gave 7 pass,
15 fail; restored, 22 pass, 0 fail. The 7 that pass on the base are the pure
units of the new module (reason order, scrub and cut, the owner DM dedup, the
reply body); every `modelCallFailedLine`, `task run`, spawn-client, chat,
ask-pick, `/session start`, `/work` and schedule case fails on the base
(the old `failed (exit N)` line, no `error`, no DM).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-032` | `tests/discord.failed-reply.test.ts` ("failureReasonFor / plainFailureLine") | The frame's `error` wins; a key in stderr is `[redacted:openai-key]`, also across the cut; a stack / source excerpt / host path / banner stderr becomes `error: ENOENT: … posix_spawn '…/corvidinho'`; ≤ 200 chars, one line, `…` on a cut; URL hosts kept, `@everyone` defanged; no reason → the AGENT-10 notice, else the stderr end, else the exit code; never the summary. |
| `REQ-discord-032` | `tests/discord.failed-reply.test.ts` ("createFailureOwnerDm", "failedRunReply") | One DM per reason per hour; a failed or thrown DM is false and retried next time; no owner / no DM path false; owner → reason, others → told or `That didn't work.`; one `[discord] run failed (<surface>, exit N): …` log line each. |
| `REQ-discord-032` | `tests/discord.failed-reply.test.ts` ("chat", "an ask pick", "/session start and /work", "schedule result posts") | Owner body = the reason with `state=failed verified=false attempts=1` only in the footer; a team member's run → `That didn't work — the owner has been told.` and one owner DM `❌ A run failed (<surface> in <#chan-1>): …` per reason; failed DM / no owner → `That didn't work.`; no provider → the AGENT-10 notice; a thrown run → scrubbed `❌` line (owner) or the told line; schedules: owner's → reason (row error kept), others → told with DM or `That didn't work.` (daemon, failed DM), `[scheduler] run failed (schedule <id>, exit 1)` logged. Fail on base. |
| `REQ-discord-032` | `tests/discord.failed-reply.test.ts` ("end to end …") | The bridge spawning the real `task run` against the 401 provider answers the owner `The model call failed (401 Unauthorized from 127.0.0.1:<port>)` and a team member the told line, DMing the owner; the provider body never appears. Fail on base. |
| `REQ-agent-032` | `tests/discord.failed-reply.test.ts` ("modelCallFailedLine", "task run: …") | Each failure kind's line; `verifyGaveUpReason` / `VERIFY_RERUN_FAILED_REASON`; the real CLI's `result` frame has `error` `The model call failed (401 Unauthorized from 127.0.0.1:<port>)` without the body, and the AGENT-10 notice with no model; the spawn client hands over `failureReason` and a crash's `stderrTail` (≤ 4000), neither on success. Fail on base. |

## Automated coverage

- `tests/discord.failed-reply.test.ts` (22 tests).
- Updated for the new line: `tests/discord.thinking-bridge.test.ts`,
  `tests/discord.inflight-replies.test.ts`, `tests/scheduler.ask-outbox.test.ts`.
- Unchanged suites that cover the touched files still pass (`bun test`, all
  files).
