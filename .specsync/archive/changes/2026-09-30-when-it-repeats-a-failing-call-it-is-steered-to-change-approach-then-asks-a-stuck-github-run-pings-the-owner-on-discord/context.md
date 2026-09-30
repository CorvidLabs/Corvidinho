---
change: when-it-repeats-a-failing-call-it-is-steered-to-change-approach-then-asks-a-stuck-github-run-pings-the-owner-on-discord
artifact: context
---

# Context

Issue #86 (M3 "Real dev teammate"), slice loop-guards-a of the M3/M4 plan.
Leif confirmed AGENT-16 as written in the 2026-09-28 interview (round 2:
"repeat-failure → change approach or ask"); it was already captured in
`hi/agent.md`. In round 13 (2026-09-30) he decided that WATCH stuck asks
"ping the owner on Discord like other stuck asks (needs the bridge running)";
this PR captures that as AGENT-16.a with `hi` (its own commit) and builds
both.

What was wrong on main (5093b81):

- `runToolLoop` (src/agent/execute.ts) sent every failure back as a plain
  tool message and kept no record of which calls failed. A model repeating
  the same failing call burned rounds until the tool-round budget ran out
  (AGENT-9 soft-land: prose or a clarifying line, never a HumanAsk), so it
  neither changed approach nor asked.
- On WATCH a stuck ask reached only the run-summary comment (ackable events
  after a successful ack, no owner mention); assignments and review requests
  posted nothing. The WATCH spawn client dropped the result frame's `ask`.

Constraints: specs only through SpecSync; thresholds are constants (no env
var, config key, flag, slash command or schema version bump); the existing
`stuck` HumanAsk reason and each surface's stuck path are reused; v1 is
off-chain; the forget card (src/discord/forget-card.ts) and approval code are
untouched (other PRs); #232/#233 scope untouched. Out, because not captured
(PROCESS-1): the '3 in 20 calls' window, did-you-mean for unknown tools, the
prefer-plugin steer, and AGENT-17 (next slices). Conservative defaults come
from /home/user/coord/m34-defaults.md (slice loop-guards) and are listed in
the PR under "Design choices pending Leif".
