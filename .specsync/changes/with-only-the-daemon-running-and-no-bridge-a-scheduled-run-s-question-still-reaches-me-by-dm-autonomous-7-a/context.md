---
change: with-only-the-daemon-running-and-no-bridge-a-scheduled-run-s-question-still-reaches-me-by-dm-autonomous-7-a
artifact: context
---

# Context

Issue #125 (M5). Leif's 2026-09-28 interview, round 17 (2026-10-07): the next
big build is "daemon reaches owner (AUTONOMOUS-7)". AUTONOMOUS-7 is on main;
AUTONOMOUS-7.a — "With only the daemon running and no bridge, a scheduled
run's question still reaches me by DM." — is captured with `hi` in this PR
(`hi/autonomous.md`, `INTENT.md` index).

Before this change, with `corvidinho daemon` alone on a data dir, a schedule
run that stopped to ask a human only logged `run.needs_human`; the ask stayed
on its `schedule_runs` row until a bridge's scheduler tick posted it
(REQ-discord-347), so with no bridge the owner was never reached and the
schedule kept waiting (AUTONOMY-6.a).

Constraints: no gateway in the daemon (Discord's REST API with the bot token
is enough to DM); a button press needs a gateway to be received, and there is
no `corvidinho schedule answer|cancel` command (not invented here); no schema
bump (the `ask_posted_at` compare-and-set is the delivered marker); no new env
var (the bridge's token and owner); never double-deliver once a bridge starts.
