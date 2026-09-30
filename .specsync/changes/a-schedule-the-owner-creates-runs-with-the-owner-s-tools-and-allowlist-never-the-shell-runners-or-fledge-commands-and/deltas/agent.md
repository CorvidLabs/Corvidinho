---
module: agent
change: a-schedule-the-owner-creates-runs-with-the-owner-s-tools-and-allowlist-never-the-shell-runners-or-fledge-commands-and
---

# Delta: agent (a scheduled run gets no Fledge discovery, and a must-ask no ends it with a blocking ask, DISCORD-SCHEDULE-1.a)

## Added

### REQUIREMENT REQ-agent-741

The owner's own schedule in the task run (DISCORD-SCHEDULE-1.a, #124). A
scheduled run (`isScheduleRunEnv`, `src/plugins/roles.ts`) may carry the
owner stamp (REQ-discord-741); it SHALL get the owner's tools per the run's
allowlist but never the shell, runners or Fledge runs (the SAFE-3.a gate
refuses its `schedule` surface, REQ-agent-503) and never a discovered Fledge
plugin command: `createTaskExecute` SHALL NOT call `loadFledgePlugins` in a
scheduled run, whatever its role (the `includeDangerous` test seam aside).

`src/agent/ask.ts` SHALL export `mustAskRefusedAsk(tool, result)`: for a
`runPlugin` refusal from the must-ask gate (`data.refused === true`) whose
`data.outcome` is `denied`, `expired` or `resent` it SHALL return a `stuck`
HumanAsk whose question names the tool, the gate's scrubbed `why` (whitespace
folded, at most 300 characters), the rule and the card id, says nothing was
done (for `expired`: nobody answered in time, SAFE-20) and that the schedule
waits for an answer, normalized like every ask (`normalizeQuestion`: scrubbed,
capped); it SHALL return null for a call that ran, any other outcome
(`worker`, `no-owner`, `unavailable`, `aborted`) and a result without that
data. In a scheduled run `runToolLoop` SHALL, right after an offered call's
`ToolResult` event, end the run with that ask when it is not null: one
`[operator] DISCORD-SCHEDULE-1.a: <tool> was refused on its Approve card; this
scheduled run stops and asks` Text event, `askExecuteResult` (so `runTask`
returns `blocked` with the ask and skips verify), and no later call of that
batch runs. Outside a scheduled run the refusal SHALL still go back to the
model as today. No env var, config key, flag or schema.

Acceptance Criteria
- `tests/agent.allowlisted-dangerous.test.ts`: with the owner stamp, surface `schedule` and a `schedule_*` session, an allowlist naming `fledge-hello`, `github-pr-review`, `files-delete` and `shell-exec` offers `github-pr-review` and `files-delete`, not `shell-exec`, only the read-only Fledge core builtins, and never discovers `fledge-hello` or spawns fledge.
- `tests/scheduler.owner-role.test.ts`: in the owner's scheduled run a denied `discord-post-message` card leaves the post refused, the next call in the batch unrun, one model request, the run `blocked` with no verify and the stuck ask naming the tool, its why, AUTONOMY-10 and the card; a lapsed card gives the "nobody answered … in time (SAFE-20 …)" ask; the owner's chat with the same deny ends `done` with no ask; another person's schedule is not offered the post and raises no card.
- `mustAskRefusedAsk` gives the exact question for `denied`, the lapse and resent wording, null for the other outcomes, a call that ran and plain failures, and cuts a long why and scrubs a token in it.
- The allowlisted-dangerous, denied and lapsed tests fail with the base sources.
