---
change: an-idle-timeout-and-a-turn-cap-i-set-stop-stalled-or-endless-runs-and-it-says-so-agent-12
artifact: context
---

# Context

Tracked under issue #80 (M3 "Real dev teammate"; tracker #123). Leif
confirmed AGENT-12 in the 2026-09-28 interview (round 2, "#79/#80 providers:
capture all four") and it is captured on main in `hi/agent.md`: "An idle
timeout and a turn cap that I set stop stalled or endless runs, and it says
so." Nothing new is captured in this change.

What was wrong on main (aeb2de3): there was no idle timeout and no turn cap
I could set. The tool loop had a fixed `maxToolRounds ?? 8` per attempt
(`task run` passed none, and no env key, config key or flag set it), and the
only time bound was the fixed 10-minute per-request model timeout
(REQ-agent-244). A tool or a verify lane that hung silently kept the run
going until the bridge's own limits, if any; a run that hit the round cap
said so only in an operator `Text` line.

Constraints: specs only through SpecSync; v1 off-chain; #232/#233 scope
untouched; second-review-1 (`src/work/review.ts`, the github-pr-create
gate) is built in parallel and not touched; in `src/agent/execute.ts` only
the loop-limit and model-call regions change (the #325 fallback chain,
#328/#334/#339 spend guard, #313 repeat guard and #335 stall nudge are kept
as they are). #340 (DISCORD-3.b, `src/discord/failure-reason.ts`) landed on
main (aeb2de3) while this was built, and this change is rebased on it: an
idle-timed-out run sets the result's `error` to its one line, which
`failureReasonFor` shows as the owner's reply (everyone else gets "That
didn't work — the owner has been told."). Where a design question
remains, the conservative defaults in `/home/user/coord/m34-defaults.md`
(providers rows) are used and listed in the PR under "Design choices pending
Leif".
