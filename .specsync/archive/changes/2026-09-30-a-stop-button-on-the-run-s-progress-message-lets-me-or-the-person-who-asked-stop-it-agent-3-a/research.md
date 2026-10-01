---
change: a-stop-button-on-the-run-s-progress-message-lets-me-or-the-person-who-asked-stop-it-agent-3-a
artifact: research
---

# Research

- Sources: `/home/user/coord/interview-2026-09-28.md` (round 7 AGENT-3
  design call; round 13 "Stop and the queue" and "Stop schedule runs"), the
  slice record `/home/user/coord/pr-stop-button-2.json`, the stop-button rows
  of `/home/user/coord/m34-defaults.md`, #332's archived change (queue, stop
  words, `SessionRunControl`) and issue #122 (tracker).
- `SessionRunControl` keeps `progress message id → running turn`
  (`byProgressMessage`) only while the turn runs; `done` drops it. Run ids are
  `run_<n>` from a per-process counter, so they repeat after a restart; the
  progress message id (a Discord snowflake) does not.
- The chat and pick paths call `turn.setProgressMessage` right after
  `thinking.start`; slash handlers do the same when a turn exists.
- Discord's message PATCH leaves `components` untouched when the field is
  absent; `components: []` clears them. The live `editEmbed` sent only
  `embeds`, so working edits keep a button, and `done` / `fail` needed an
  explicit clear. `finalizeContent` already sends `components: null` (⇒ `[]`)
  for the first part unless the answer has its own.
- The ask press gates (`componentChannelAllowlisted`, `gateActor`,
  `gateRateOrMute`) were inline in the ask branch; a closed ask supplies its
  talk for the channel gate, a stale Stop button has none unless its message
  is a tracked answer (`getByBotMessage`).
- Restart recovery (`recoverInterruptedReplies`) edits the frozen embed with
  `editEmbed` only, which would leave a dead run's button behind.
