---
change: once-a-session-question-s-buttons-expire-the-session-stops-waiting-and-my-next-message-runs-normally-a-schedule-s
artifact: design
---

# Design

- **No runtime change.** The bridge's continue path (`src/discord/bridge.ts`)
  already clears a button `pendingAsk` past `expiresAt` with
  `store.clearPendingAsk` before the AUTONOMY-5/6 thin-reply gate (any
  message but a cancel), so the newest live ask is restated or, with none
  left, the message runs as ordinary chat (button asks never add the
  prior-question block). Late presses get `ASK_CHOICE_EXPIRED`
  (REQ-discord-045). Schedule asks live in `schedule_runs` and
  `ScheduleStore.openAsk` / `openRunAsk` have no time condition, so
  `SchedulerService.tick()` keeps skipping due runs and
  `handleScheduleAskPress` keeps taking presses until the ask is closed.
- **Tests pin both halves on the real window.** A new
  `tests/discord.expired-asks.test.ts` freezes the system clock
  (`setSystemTime`) and moves it to one minute inside and one minute past
  `ASK_BUTTON_TTL_MS` instead of hand-editing `expiresAt`, so it also pins
  that the bridge stamps the ~30-minute window. Session half: chat (thin
  reply and a new request), a `/session start` answer, a `/work` answer,
  and a bridge restart on the same DB. Schedule half: a
  manual `SchedulerService` with both clocks moved past the window (and a
  day on) and, through `startBridge`, a session ask and a schedule ask of
  the same age side by side. Plus hi/doc citation cases.
- **Docs**: `docs/discord.md` cites AUTONOMY-6.b where the expiry is
  described (the Choose paragraph, the thin-reply paragraph and the
  schedule-questions paragraph); `docs/DISCORD-GO-LIVE.md`'s schedule
  question bullet adds the session contrast.
- **Conservative choices** (pending Leif): "a session question's buttons"
  is read as a Choose (button) question; a free-text question's **Answer**
  button also stops after ~30 minutes, but that question stays open for a
  reply as built (DISCORD-ASK-4.a), so a thin reply still restates it. A
  `cancel` sent after the expiry still gets the short cancel ack and runs
  nothing, as built. If an earlier button ask of the same session is still
  live, a thin reply restates that one (SESSION-MULTI-3); only the expired
  question stops waiting. All are kept unchanged and listed for Leif.
