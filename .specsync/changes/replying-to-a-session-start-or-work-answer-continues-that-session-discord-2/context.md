---
change: replying-to-a-session-start-or-work-answer-continues-that-session-discord-2
artifact: context
---

# Context

Bug found by the Discord bridge end-to-end check (bridge report, defect 1,
DISCORD-2). Repro: the owner runs `/session start topic:A`, then
`/session start topic:B`, then replies to A's answer. With the reply ping on,
the run went to session B (the router fell through to the @mention path, which
reuses the user's newest session in the channel). With the ping off, nothing
happened at all. The same holds for `/work`.

Cause: `buildSlashCtx()` in `src/discord/bridge.ts` never set
`SlashContext.trackBotMessage`. The slash handlers already pass it to
`finishSlashWithThinking` (since #208, DISCORD-ASK-7), which calls it with the
collapsed thinking message id, but the call was a no-op, so no slash answer was
ever mapped to its session. The fallback path (collapse fails, the answer goes
into the deferred slash reply via `editReply`) had no message id to track at
all: `SlashInteraction.editReply` resolved with nothing.

Re-verified on origin/main 6e5370d before the fix: 5 of the 6 new tests fail
(ping on → session B; ping off → no run; fallback reply → no run).
Re-verified after merging origin/main 3cdbb5c (SAFE-8 x DISCORD-ASK-7): the
same 5 fail on its sources; the slash handlers still pass `trackBotMessage`
through `finishSlashWithOwnerNotice` → `finishSlashWithThinking`.

Review after merging origin/main dbe37ce: #216 (REQ-discord-044) wired the
same `trackBotMessage` closure in `buildSlashCtx()`, so on dbe37ce sources
the collapsed-answer tests pass and only the fallback test fails (the
deferred reply id is still never tracked there); #216 also fixed defect 3
(slash asks stay pending). The merge keeps one closure. The review adds a
member's `/work` A/B test (the configured owner, ADMIN, cannot continue a
member's session either) and makes the closure best effort: a failed
bot-message DB write (e.g. "database is locked") is logged, and the slash run
still resolves its deferred reply (that test fails on the merged tree without
the guard).

HI: DISCORD-2 / DISCORD-2.a (`hi/discord.md`), SESSION-MULTI-1..4
(`hi/session.md`). The router's owner-only reply rule (REQ-discord-046) is
unchanged; the new tests pin it for slash answers.

Constraints: no new slash command, env var, CLI flag or schema change. Bot
message ids are persisted through the existing `SessionStore.trackBotMessage`.
Out of scope (separate defects in the same report): `/work` / `/session
start` not storing `pendingAsk` (defect 3, fixed on main by #216), and the
forwarded-message allowlist gap in the reply path (defect 2, PR #218).
