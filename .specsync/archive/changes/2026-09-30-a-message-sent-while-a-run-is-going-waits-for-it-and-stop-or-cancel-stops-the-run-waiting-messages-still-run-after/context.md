---
change: a-message-sent-while-a-run-is-going-waits-for-it-and-stop-or-cancel-stops-the-run-waiting-messages-still-run-after
artifact: context
---

# Context

Part of #122 (M2 "Talk anywhere"); slice stop-button-1 of the M3/M4 plan
(`/home/user/coord/pr-stop-button-1.json`). No tracking issue names AGENT-3
(searched open issues for AGENT-3 / stop / queue), so the PR says "Part of
#122".

Leif confirmed AGENT-3.a in the 2026-09-28 interview (round 7: "Stop button +
'stop'/'cancel' text from requester or owner aborts the session's run
(process tree killed); a follow-up while running is queued, not run in
parallel"); it is captured on main in `hi/agent.md`. In round 13 (2026-09-30)
he decided "Stop and the queue: waiting messages still run in order after a
stop", captured in this PR with `hi` as AGENT-3.b ("After I stop a run,
messages that were waiting still run, in order.").

What was wrong on main (af4597e): every Discord message routed to a session
started its own `task run` at once, so a follow-up sent mid-run ran in
parallel in the same worktree and thread, and nothing on Discord could stop a
run: `AgentRunChatOpts.signal` (which kills the process tree, REQ-cli-108)
was only used by the daemon and the scheduler at shutdown. 'cancel' only
cleared open asks.

Constraints: smallest change on the existing run paths (bridge chat,
ask pick / Answer resume, `/session start`, `/work`); reuse the spawn
client's process-group kill, the in-flight reply rows (REQ-discord-311) and
the Approve/Deny card engine's "nobody waits ⇒ no" (SAFE-20); no new env
var, config key, slash command, table or schema bump; specs only through
SpecSync; #232/#233 and the files of #328 (spend caps) and #329 (repo ways)
untouched; v1 off-chain. Out: the Stop button (next slice, stop-button-2)
and stopping a schedule's run from Discord (a later slice; Leif round 13:
the owner or the schedule's creator can stop it) — so AGENT-3.a is partial
here.
