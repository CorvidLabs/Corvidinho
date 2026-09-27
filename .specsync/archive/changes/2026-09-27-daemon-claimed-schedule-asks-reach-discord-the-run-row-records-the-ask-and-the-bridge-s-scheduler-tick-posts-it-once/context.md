---
change: daemon-claimed-schedule-asks-reach-discord-the-run-row-records-the-ask-and-the-bridge-s-scheduler-tick-posts-it-once
artifact: context
---

# Context

Captured HI: **AUTONOMY-2** ("When stuck, it pings the configured owner on
Discord rather than dying silently") and **AUTONOMOUS-7** ("When autonomous
work needs a human, it can reach me through the configured owner channel
(Discord) instead of dying quietly"). Issues #97, #104. The routing rules
kept as they are: AUTONOMY-4 (clarify → requester, stuck → owner) and SAFE-8
(a spend-cap ask pings the owner once per cap episode).

Gap on main (fc0ed8d): `src/daemon/daemon.ts` builds `SchedulerService`
with no owner and no outbound, so a schedule run the headless daemon claims
(AUTONOMOUS-4) that stops with a stuck, clarify or spend-cap ask posts
nothing. The only trace is the `run.needs_human` warn log line (reason, no
question); the run row stores only `failed (exit 1)`, so the question is
lost, and a bridge on the same data dir (the documented pairing that splits
due runs between the two) never delivers it. docs/DAEMON.md said so: "A run
the daemon claims is only recorded in the run history".

Constraints: REQ-cli-108 — the daemon runs with no Discord token, so it must
hand the ask to the bridge, not post it. DISCORD-SCHEDULE-4 — a tick must
not wait on slow work. SAFE-6 — the model-written question is stored at
rest, so it is scrubbed and listed in `SCRUB_TARGETS`. No new slash command,
env var, DM or channel. This slice owns schema v11.

Out of scope: WATCH stuck runs (hi/watch.md keeps WATCH answers on GitHub),
delegate workers (their ask reaches the lead, which can ask-human), and a
daemon posting on its own (would change REQ-cli-108; question for Leif).
