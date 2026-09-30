---
change: when-it-repeats-a-failing-call-it-is-steered-to-change-approach-then-asks-a-stuck-github-run-pings-the-owner-on-discord
artifact: requirements
---

# Requirements

- AGENT-16 (captured, `hi/agent.md`, Leif 2026-09-28 round 2): "When it
  repeats a failing call, it changes approach or asks me."
- AGENT-16.a (captured in this PR with `hi`, Leif 2026-09-30 round 13):
  "When a GitHub run is stuck and needs me, it pings me on Discord like other
  stuck asks."
- Kept: AUTONOMY-2/4 (stuck pings the configured owner), AGENT-9 (soft-land
  on the round budget), SAFE-12/13 (fences and the injection drop), SAFE-6 /
  SAFE-6.a (scrub before cut and at rest), ROLES-CHAT-3 (no refused plugin
  name in the question), REQ-watch-231 (run-summary comment),
  REQ-discord-347 (schedule ask outbox pattern), MEMORY-ACL-6.a (WATCH and the
  bridge share the data dir).
- Added: REQ-agent-086 (repeat-failure guard in the tool loop),
  REQ-watch-086 (WATCH hands a stuck ask to the bridge),
  REQ-discord-086 (the bridge DMs the owner).
- No new env var, config key, flag, slash command, HumanAsk reason, NDJSON
  field or schema version. New module-owned table `watch_owner_asks`
  (created on first use, like `watch_event_ids`) and one `schema_meta` key
  (`discord_bridge_runner`).
