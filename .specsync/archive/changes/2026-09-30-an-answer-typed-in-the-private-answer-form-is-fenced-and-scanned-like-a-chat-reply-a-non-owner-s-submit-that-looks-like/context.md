---
change: an-answer-typed-in-the-private-answer-form-is-fenced-and-scanned-like-a-chat-reply-a-non-owner-s-submit-that-looks-like
artifact: context
---

# Context

Issue #71 (SAFE-11/12/13, M2 "Talk anywhere"). The #71 rollup found an
ordering gap: #295 (SAFE-11..13) fenced and scanned a non-owner's chat
message, `/session start` topic and `/work` description, and #294
(DISCORD-ASK-4.a, the private Answer form) merged after it. The form's
MODAL_SUBMIT path in `src/discord/bridge.ts` built the resumed run's prompt
from the typed text directly, so a non-owner's answer reached the model
unfenced and unscanned. A local probe showed a community user's injection
payload typed in the form starting a normal run with no refusal, no owner
ping and no audit row, while the same words as a chat reply were refused.

Leif's design decision (interview 2026-09-28, #71 rollup): fix it exactly like
a non-owner's chat reply in the same session — the same fence
(`fenceSpeakerText`) and the same detector / refusal path (`detectInjection`
via `inboundInjection` → no run, one reply pinging only the owner, session
handling identical to chat, SAFE-5 `injection-suspected` / `denied` row),
the owner's own words unfenced and unscanned; check every other resume path
that carries human-typed text into a run.

Captured HI (already on main in `hi/safe.md` and `hi/discord.md`, no
`hi/` edits here): SAFE-12, SAFE-13, DISCORD-ASK-4.a.

Out of scope: #232 / #233 (landed separately), the WATCH and slash paths
(already fenced by #295), schedule ask answers (not built on main: schedule
asks post text only, no answer path feeds a run).
