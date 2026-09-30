---
change: a-schedule-s-question-can-be-answered-or-cancelled-by-the-owner-or-its-creator-and-its-next-runs-wait-with-one-note
artifact: context
---

# Context

Issue #124 (M4 "Safe autonomy"). Leif's 2026-09-28 interview, round 8
(/home/user/coord/interview-2026-09-28.md): "AUTONOMY-6: schedule asks
answerable + blocking — creator or owner can answer/cancel (Choose or free
text); later ticks skipped with one note until answered; then resume",
captured on main (hi/autonomy.md) as **AUTONOMY-6.a** "A scheduled run's
question can be answered or cancelled by me or the schedule's creator, and
the schedule's next runs wait, with one note, until it is." (parent
**AUTONOMY-6** "Session stays blocked until a substantive answer or an
explicit cancel."). Round 10 settled free-text asks as "public stub +
private modal" (DISCORD-ASK-4.a). Nothing new is captured in this change.

On main (156cfa9, schema v14) a schedule run's ask (REQ-discord-347 /
REQ-discord-353) is recorded on its `schedule_runs` row, posted once as text
with no buttons, never answered and never blocking: the schedule keeps
running every slot, re-posting the same question unpinged; a schedule with
no channel posts nothing at all.

Planned scope (/home/user/coord/pr-schedule-ask-block.json) and the
schedules-owner defaults (/home/user/coord/m34-defaults.md): every recorded
run ask blocks, including the could-not-start and auto-pause asks;
`/schedule resume` does not close an open ask; schedule ask controls never
lapse while open (DISCORD-ASK-5's ~30-minute expiry stays for session asks;
the reconciliation is recorded in REQ-discord-045); a channel-less
schedule's ask, controls and note go to the live owner by DM and presses
there skip the channel check; a channel reply does NOT answer a schedule
ask — only Choose, Answer (private modal) and Cancel. Schema v15,
forward-only, closing legacy asks. Spend-cap asks get Cancel only
(continuing is spend-caps-c) and keep #317's "Work is paused for budget."
rule. Reuse #316's `sendDm` and the DISCORD-ASK buttons and Answer modal.
Out of scope: owner-role schedule runs (schedule-owner-role),
`src/plugins/run.ts` / `must-ask.ts` and provider / tier code (other PRs
in parallel), #232/#233.
