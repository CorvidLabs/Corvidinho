---
id: once-a-session-question-s-buttons-expire-the-session-stops-waiting-and-my-next-message-runs-normally-a-schedule-s
state: approved
type: feature
base_commit: d8c77bb6d8457640272a3b72c5c054c5905b0691
---

# Once a session question's buttons expire the session stops waiting and my next message runs normally; a schedule's questions still wait until answered (AUTONOMY-6.b)

## Intent

Once a session question's buttons expire the session stops waiting and my next message runs normally; a schedule's questions still wait until answered (AUTONOMY-6.b)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- AUTONOMY-6.b (captured with hi in this PR from Leif's 2026-09-28 interview, round 17 decision on 2026-10-07: keep as built): "Once a session question's buttons expire, the session stops waiting and my next message runs normally; a schedule's questions still wait until answered." Holds as built, no runtime change: a session's Choose question (chat, /work, /session start) gets buttons that expire ASK_BUTTON_TTL_MS (~30 minutes, DISCORD-ASK-5) after it is asked; inside that window a thin reply restates it with its live Choose button and runs nothing (AUTONOMY-5/6); once the window has passed, the requester's next message that is not a cancel first drops the expired ask (clearPendingAsk, REQ-discord-044) and then runs the agent as ordinary chat with no prior-question block (a thin ok included), leaves no question open unless an earlier ask is still live, and a late press on the expired buttons gets ASK_CHOICE_EXPIRED with no run (REQ-discord-045). A schedule's question (AUTONOMY-6.a, REQ-discord-606) never lapses: one minute past that same window and a day on, the schedule's due runs are still skipped with one wait note, its Choose still opens and takes a pick, a chat message from its creator does not close it, and only an answer (or cancel) lets the next run go. REQ-discord-044 and REQ-discord-045 (Modified) cite AUTONOMY-6.b; docs/discord.md (at the ~30-minute expiry, the thin-reply rule and the schedule exception) and docs/DISCORD-GO-LIVE.md cite it. tests/discord.expired-asks.test.ts pins both halves on a frozen system clock; its hi/doc citation cases fail on the base sources and pass on the branch, and its behaviour cases fail under a mutation that keeps expired session asks waiting or lets schedule asks lapse after 30 minutes.

## No-spec Rationale

Not applicable
