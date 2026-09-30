---
change: a-non-owner-s-schedule-text-is-scanned-at-schedule-create-and-fenced-at-every-tick-a-non-owner-s-create-whose-name-or
artifact: context
---

# Context

Issue #71 (SAFE-11/12/13, M2 "Talk anywhere"). The review of #299 (the
private Answer form fence) listed every path that carries human-typed text
into a run and found one more gap: the scheduler tick. A schedule's prompt
is written by its creator at `/schedule create` and `src/scheduler/service.ts`
put `schedule.prompt` into `runChat` as-is — neither fenced (SAFE-12) nor
scanned (SAFE-13). The run is capped (`actingIsAdmin: false`, no acting role,
so community tools) and a tool result that trips the detector still tells the
owner, but there was no SAFE-13 refusal at create or at run time, and a
schedule stored earlier (when admin lists still granted ADMIN, or by someone
who is no longer the owner) is replayed on every tick with no check at all.

Leif's design decision (interview 2026-09-28, #71 rollup): fix it like the
other slash surfaces — (1) at `/schedule create` (and any edit path) scan a
non-owner creator's prompt / name / description with the same detector and
refuse with the existing `refuseInjectedSlash` UX (private refusal, one fresh
post pinging only the owner, SAFE-5 `injection-suspected` / `denied` row);
nothing is stored. (2) At every tick fence the stored prompt with
`fenceSpeakerText` using the creator's role re-resolved at tick time (the
owner's own schedules stay unfenced, as owner chat does), so a schedule
stored before this fix is still treated as data; optionally re-scan at tick
and skip the run with one owner note (conservative). Keep schedule posts,
asks and SAFE-3.a (schedules never get shell / runners) unchanged.

Captured HI (already on main in `hi/safe.md`, round 4 of Leif's 2026-09-28
interview; no `hi/` edits here): SAFE-12, SAFE-13.

Constraints: `/schedule` mutations are ADMIN (owner-only, IDENTITY-2), so on
main a non-owner's create is a quiet `NOT_AUTHORIZED`; there is no edit path
for a schedule's text (pause / resume / delete take none). #299 is open and
edits `src/discord/injection-guard.ts` (`SpeakerSurface`, the body of
`refuseInjectedSlash`), REQ-discord-071 / -548 and the SAFE-13 paragraphs in
the docs; this change keeps `refuseInjectedSlash`'s signature, adds a new REQ
instead of modifying REQ-discord-071, and adds doc lines instead of editing
#299's, so the two land in either order with at most a one-line
`SpeakerSurface` merge. Out of scope: #232 / #233, the daemon's own audit
trail (it writes none today), DISCORD-SCHEDULE-1.a (owner schedules running
as owner, M3/M4).
