---
change: capture-leif-s-2026-09-28-interview-decisions-for-m2-m3-m4-and-the-captured-id-design-calls-into-hi-safe-3-a-safe-11-16
artifact: context
---

# Context

Leif answered an 11-round multiple-choice interview on 2026-09-28 (Corvidinho
fan-out worker session) on every open draft criterion and on the design calls
the W11 scoping left blocked. He chose "capture into hi/". Per his execution
answers, each M1 issue (#36, #65, #101, #67, #69, #68) captures its own ids in
its own PR; this PR captures everything for the later waves (M2, M3/M4 and the
design calls on already-captured ids) so they build against main.

Renumbering: drafts that collided with captured ids got free ids (the provider
draft is AGENT-13; the must-ask drafts are AUTONOMY-8..11). Design calls on
captured ids are `.a` sub-criteria. `hi` cannot capture a `.a` id under a
multi-part prefix (DISCORD-SCHEDULE, DISCORD-ASK, SESSION-WORKTREE), so those
four lines were added by hand in the same nested format; `hi check` passes.

Two answers were reconciled: SAFE-3.a keeps the shell and runners away from
schedules, and DISCORD-SCHEDULE-1.a lets owner-created schedules otherwise act
as the owner. PLUGIN-5.a records that /work and /schedule stay on until turned
off, which refines PLUGIN-5's "disabled until I opt in" for these two.
