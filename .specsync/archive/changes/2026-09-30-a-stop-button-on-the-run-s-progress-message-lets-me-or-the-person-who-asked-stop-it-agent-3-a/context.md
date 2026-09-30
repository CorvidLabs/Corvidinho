---
change: a-stop-button-on-the-run-s-progress-message-lets-me-or-the-person-who-asked-stop-it-agent-3-a
artifact: context
---

# Context

Part of #122 (M2 "Talk anywhere"); slice stop-button-2 of the M3/M4 plan
(`/home/user/coord/pr-stop-button-2.json`), stacked on stop-button-1 (#332,
merged as f79a848), which built the per-session queue and the stop words. No
tracking issue names AGENT-3, so the PR says "Part of #122".

Leif confirmed AGENT-3.a in the 2026-09-28 interview (round 7: "Stop button +
'stop'/'cancel' text from requester or owner aborts the session's run
(process tree killed); a follow-up while running is queued, not run in
parallel"); it is captured on main in `hi/agent.md`. AGENT-3.b ("After I
stop a run, messages that were waiting still run, in order.", round 13) was
captured in #332. Nothing new is captured here.

What was missing on main (9ea4005): AGENT-3.a names a Stop button, but a run
could only be stopped by the words 'stop' / 'cancel'; the progress message
carried no component, and `onComponent` knew only Approve cards (`cvok:`) and
asks (`cvask:`).

Constraints: build on #332's `SessionRunControl` (run id, AbortController,
progress-message map, idempotent `stop`) and reuse its stop path, never a
second one; smallest change on the progress-message plumbing
(`ThinkingStatus`, `ThinkingOutbound.sendEmbed` / `editEmbed`, the live
gateway, `memoryThinkingOutbound`) and the `onComponent` cvstop branch; the
press sits behind the same channel, actor and mute / rate gates as an ask
press; no new env var, config key, slash command, table or schema bump;
specs only through SpecSync; #232 / #233 untouched; v1 off-chain. Parallel
slices touch `src/cli.ts` / agent-client spawners (cli-worktree) and the
spend guard / schedule-ask spend continue (spend-caps-c), so this change
stays out of those files. Out: stopping a schedule's run from Discord (Leif
round 13: the owner or the schedule's creator can) — a separate later slice.
