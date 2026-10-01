---
change: an-idle-timeout-and-a-turn-cap-i-set-stop-stalled-or-endless-runs-and-it-says-so-agent-12
artifact: requirements
---

# Requirements

- AGENT-12 (captured, `hi/agent.md`, Leif 2026-09-28 round 2): "An idle
  timeout and a turn cap that I set stop stalled or endless runs, and it says
  so."
- Kept: AGENT-3 (stop means stop: process trees killed, REQ-agent-244 /
  REQ-cli-244), AGENT-4 / AGENT-4.a (verify retries keep working — the cap is
  per attempt), AGENT-9 (the capped attempt ends with its best prose; the
  stop reason only in the footer / thinking plumbing), DISCORD-3.a (no
  plumbing in the channel body), AGENT-11 (#325 chain), SAFE-8/14/15/16 and
  SAFE-18..20 (card waits hold the watchdog, never time out a card early),
  AGENT-14/15/15.a (an idle-timed-out run is not done), AGENT-16/17 (guards
  unchanged), DISCORD-10 (protocol 2 unchanged; fields additive).
- Modified: REQ-agent-244 (the idle watchdog, what feeds and holds it, the
  idle-timeout result), REQ-agent-312 (the turn cap I set, `stopReason`,
  `stopped=` plumbing).
- Added: REQ-cli-125 (`task run` reads both keys, invalid-value note, the
  text-mode turn-cap line, `--help`, `.env.example`), REQ-discord-125
  (`stopped=…` in the footer; card waits hold the watchdog),
  REQ-watch-125 (the comment's plain turn-cap line), REQ-plugins-125
  (`spawnCapped` output counts as activity).
- New optional env keys (the captured text needs settings I set):
  `CORVIDINHO_MAX_TURNS` (default 8, today's cap) and
  `CORVIDINHO_IDLE_TIMEOUT_MS` (default 600000). No config key, flag,
  table, schema version or protocol version.
