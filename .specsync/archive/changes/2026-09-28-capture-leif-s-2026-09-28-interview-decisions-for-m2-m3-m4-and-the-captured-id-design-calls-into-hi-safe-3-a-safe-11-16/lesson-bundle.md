# Lesson bundle — capture-leif-s-2026-09-28-interview-decisions-for-m2-m3-m4-and-the-captured-id-design-calls-into-hi-safe-3-a-safe-11-16

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Capture Leif's 2026-09-28 interview decisions for M2, M3/M4 and the captured-id design calls into hi/ (SAFE-3.a, SAFE-11..16, SAFE-14.a, SAFE-18..21, AGENT-1.a/3.a/6.a/10..18, AUTONOMY-6.a/8..11, DISCORD-15/15.a/16/17, DISCORD-SCHEDULE-1.a/3.a, DISCORD-ASK-4.a, SESSION-3.a/5/6, SESSION-WORKTREE-1.a, GITHUB-7/9, ADMIN-3.c, PLUGIN-5.a)
- **Kind**: Documentation
- **Paths**: hi/, INTENT.md
- **Acceptance**: hi/ holds each listed id with the exact wording Leif confirmed in the 2026-09-28 interview (record: the PR body); `hi check` passes; hi/github.md's intent says humans still merge outside Corvidinho (GITHUB-7); no code, spec or test changes.

## Evidence

- Verification commit: `ff7d3550412cf623d6e6eb37270f12b8b4f387ec`
- Base commit: `daef9891d6ce222b26b3307d84f908554e1df58e`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

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

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
