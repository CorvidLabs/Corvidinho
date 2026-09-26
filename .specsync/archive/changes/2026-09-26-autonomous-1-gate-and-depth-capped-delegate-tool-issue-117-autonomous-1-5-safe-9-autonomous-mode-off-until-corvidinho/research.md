---
change: autonomous-1-gate-and-depth-capped-delegate-tool-issue-117-autonomous-1-5-safe-9-autonomous-mode-off-until-corvidinho
artifact: research
---

# Research

- HI: `hi/autonomous.md` AUTONOMOUS-1/5; `hi/safe.md` SAFE-9, SAFE-1, SAFE-2,
  SAFE-4, SAFE-6; `hi/plugin.md` PLUGIN-2/5/6; `hi/agent.md` AGENT-3/4/5.
  Draft AUTONOMOUS-10 (issue #117) is not captured and is left for HI.
- Issue #117 steal table: Merlin `fledge-plugin-merlin-subagent` /
  `fledge-plugin-delegation` (subagent + delegation commands), m#1124 / m#1136
  (child tier clamped to the parent ceiling, including when omitted),
  corvid-agent `work.ts` `delegatedBy` + agent-messenger depth limits.
- Existing Corvidinho seams reused: `buildCorvidinhoArgv` (REQ-agent-133
  `--no-env-file`), NDJSON `collectTaskRunStream` (REQ-agent-073), `--task`
  always takes the next argv item, the tool loop only dispatches offered tools
  (REQ-agent-128), `loadAgentConfig` `[corvidinho]` section, WATCH spawn env
  hygiene (acting admin / confirm tokens cleared).
- Found during tests: SIGTERM to a worker can leave grandchildren holding the
  stdout pipe, so the lead ends the stream itself after a short drain.
