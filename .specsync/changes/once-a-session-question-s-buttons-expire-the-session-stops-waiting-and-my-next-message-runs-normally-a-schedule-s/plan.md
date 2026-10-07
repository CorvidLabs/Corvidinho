---
change: once-a-session-question-s-buttons-expire-the-session-stops-waiting-and-my-next-message-runs-normally-a-schedule-s
artifact: plan
---

# Plan

1. `hi AUTONOMY-6.b "<Leif's text>"` (own commit); `hi check`.
2. Confirm on main that both halves already hold (bridge continue path,
   late-press path, schedule store / tick / press path).
3. `tests/discord.expired-asks.test.ts`: session half (chat thin reply and
   new request, `/session start` and `/work` answers, a restart) and
   schedule half (scheduler tick
   and bridge press) on a frozen clock one minute inside / past
   `ASK_BUTTON_TTL_MS`; hi/doc citation cases.
4. Docs (`docs/discord.md`, `docs/DISCORD-GO-LIVE.md`), spec prose,
   Modified REQ-discord-044 / 045 delta, module testing evidence.
5. Fail-on-base proof (swap main's `docs/discord.md`,
   `docs/DISCORD-GO-LIVE.md`, `hi/autonomy.md`, `INTENT.md` in, run,
   restore) and two mutation checks (keep expired session asks waiting; let
   schedule asks lapse after 30 minutes).
6. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
