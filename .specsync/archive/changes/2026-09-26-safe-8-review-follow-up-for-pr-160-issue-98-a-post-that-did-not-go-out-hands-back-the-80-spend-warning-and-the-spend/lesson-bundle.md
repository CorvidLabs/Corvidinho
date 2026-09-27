# Lesson bundle — safe-8-review-follow-up-for-pr-160-issue-98-a-post-that-did-not-go-out-hands-back-the-80-spend-warning-and-the-spend

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: SAFE-8 review follow-up for PR #160 (issue #98): a post that did not go out hands back the 80% spend warning and the spend-cap owner ping on every bridge surface (a slash reply that fails, e.g. an expired interaction token, still posts the owner notice), a warning claimed while spend is back under 80% stays pending for the next post at 80% or more, and a spend-cap stop is never kept as the session pending ask
- **Kind**: BugFix
- **Specs**: agent, discord
- **Paths**: src/agent/spend-alerts.ts, src/agent/spend-outbox.ts, src/agent/index.ts, src/discord/spend-post.ts, src/discord/bridge.ts, src/discord/session-store.ts, src/discord/command-handlers/work.ts, src/discord/command-handlers/session.ts, src/scheduler/service.ts, tests/agent.spend-ask.test.ts, tests/discord.spend.test.ts, specs/agent/, specs/discord/
- **Acceptance**: A slash /work or /session start whose final reply fails (e.g. an expired interaction token) still posts the owner notice (spend-cap ping and pending 80% warning) as a fresh channel post and the reply error is still raised; when neither the notice post nor the reply went out, the claimed warning and the claimed cap-episode ping are handed back so the next bridge post carries them. A chat reply or schedule post that did not go out hands back both the warning and the cap ping, and a schedule keeps no ping key for a ping that was never posted. A warning claimed while 24 h spend is back under 80% of its cap stays pending (no delivery, no second warning row) and the first post that sees 80% or more delivers it once: 80% at T0, 72% later, 96% later delivers exactly one warning at 96%. A spend-cap stop is never stored as the session pending ask (a later ok runs the agent, a substantive reply carries no cap text into the prompt), and a spend-cap pending ask persisted by an earlier build loads as none; clarify and stuck pending asks are unchanged (AUTONOMY-5/6). Fixture tests only; each new test fails on the previous code.

## Evidence

- Verification commit: `7d2ac505958ecdf98fc132da7339006d34f5b608`
- Base commit: `ab2b59186133982c009565f799ec0d32b121850a`
- Verified by: `specsync check --spec agent --spec discord`

## From the change's context.md

# Context

A read-only blocker review of the PR #160 fix commits (head f491d0c, SAFE-8
as amended on #98) found that the new spend alert outbox could lose what it
had claimed:

1. (major) `/work` and `/session start` claimed the pending 80% warning and
   the spend-cap owner ping (`slashOwnerNotice`) and then sent the reply
   first; when that reply threw — e.g. an interaction token that expired
   during a run longer than 15 minutes, exactly the long runs that cross
   80% — the owner notice was never posted and nothing handed the claims
   back. Reproduced: the warning stayed marked delivered, no post went out.
2. (major) `takeWarning` claimed pending warnings and then dropped them when
   current spend was back under 80%, without re-arming (re-arm needs < 70%).
   80% at T0 (WATCH / daemon, nobody told) → 72% (a bridge post drops it) →
   96%: `noteWarning` stayed disarmed, so the owner never got an 80% warning
   for that crossing — the first notice was the 100% ask.
3. (minor) The spend-cap owner ping was claimed before the chat reply,
   schedule post or slash notice and never handed back when that post failed,
   silencing the ping for up to 24 h.
4. (minor) A spend-cap stop was stored as the session `pendingAsk`: after the
   cap was lifted a thin "ok" restated the stale cap ask instead of running,
   and a substantive reply injected the cap text into the prompt as
   "[Prior clarifying question…]".

Decided by the coordinator: amounts and env names in non-owner Discord
replies (the reviewer's finding 1) are not a blocker — REQ-discord-098
specifies that behaviour and it goes to Leif separately; this change leaves
it as is.

Constraints: the canonical text lives in REQ-agent-098 and REQ-discord-098
(Modified here with the full existing text plus new acceptance bullets). No
new env var, slash command or schema version; `spend_alerts` still holds only
constant kinds and integers. AUTONOMY-5/6 (#189) stays unchanged for clarify
and stuck asks.

## From the change's design.md

# Design

- Pending under 80% (`src/agent/spend-alerts.ts` `claimSpendWarnings`): the
  outbox passes a current-spend reader; inside the same IMMEDIATE
  transaction the claim reads spend and, while it is under 80% of the latest
  warning's cap, claims nothing. Leaving the row pending was chosen over
  writing a `rearm` row: the pending row keeps the crossing disarmed, so a
  crossing can never record or deliver a second warning, and a `rearm` row
  would also have re-armed the cap ping at 72%. The row still ages out after
  24 h, when `warnArmed` re-arms as before.
- Releasable cap ping: `claimSpendCapPing` returns the inserted `cap` row's
  id; `releaseSpendCapPing` deletes that row (kind-guarded). The outbox's
  `claimCapPing()` returns `{ release }` or null; DB errors still fail open
  (a no-op claim). `askPingOwner` carries `release`.
- Chat (`src/discord/bridge.ts`): the reply is sent in try/finally; when it
  returned null (or threw) the warning and the cap ping are released; the
  dry-run branch (nothing posted) releases the cap ping too.
- Button asks (#198, merged from main): the chat reply to a run resumed by
  a button pick (`onComponent`) gets the same treatment as a chat reply —
  a spend-cap stop is always free text (no choice buttons; no choice can
  lift the cap), pings the owner once per episode, is never the pending
  ask, and the reply carries/hands back the warning and cap ping.
- Collapsed answers (#204, DISCORD-ASK-6/7, merged from main): the bridge
  prefers `thinking.finalizeContent` (edit the thinking message / Choose
  stub into the answer) and falls back to the separate reply. The warning is
  taken once before that; `withSpendWarningPost` builds the content and
  mentions used by whichever message goes out, and a finally hands the
  warning and the cap ping back when neither the edit nor the fallback reply
  went out (the dry path included). Pending-ask bookkeeping is one rule on
  both sides: store `pendingToStore` when set, else clear a free-text
  pending ask (button asks survive, SESSION-MULTI-3) — identical to main for
  every main case (there an ask always had `pendingToStore`) and, for a
  spend-cap stop, the same as a finished turn. The fallback status uses
  `askBody` (not `askBody && pendingToStore`) so a spend-cap stop never
  shows "✅ Done".
- Scheduler (`src/scheduler/service.ts`): on a post that resolved `false`
  (or threw) the warning and the cap ping are released and no ping key is
  stored.
- Slash (`src/discord/spend-post.ts`): `OwnerNotice.release` releases the
  warning and the ask's cap ping; `slashOwnerNotice` releases the cap ping
  itself when it returns null. `replyWithOwnerNotice` catches a failed reply,
  still posts the notice through `ctx.post`, falls back to appending only
  when the reply had gone out, releases when nothing carried the notice, and
  re-raises the reply error afterwards (the gateway logs it as before).
  `/work` and `/session start` pass their `askOwner` through.
- Pending asks: the bridge stores `null` instead of a `spend-cap` ask
  (clearing any older pending ask), the thin-ack restate is back to main's
  `owner: config.owner`, and `parsePendingAsk` in
  `src/discord/session-store.ts` loads a stored `spend-cap` ask as none.

## From the change's testing.md

# Testing

Fixtures only: in-memory SQLite, a fake gateway (optionally failing posts),
fake slash interactions whose `editReply` throws, an in-memory
`ScheduleStore` with a failing outbound. No network, no real Discord.
Every new test below failed on the previous code (10 failures) and passes
now.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-098` | `tests/agent.spend-ask.test.ts` "80% at T0 → 72% → 96% …" | a warning recorded at 80% is not taken at 72% (`takeWarning` null), `noteWarning` stays null at 96% (same crossing), the next take delivers `{ 4.8M of 5M, 96% }` once, and only one `warn` row exists. |
| `REQ-agent-098` | `tests/agent.spend-ask.test.ts` "a warning recorded by another run is claimed once …" | claim once, release, re-take; a post while spend is back at 46% leaves the new warning pending (`n: 1`). |
| `REQ-agent-098` | `tests/agent.spend-ask.test.ts` "claimCapPing: once per cap episode …" and "claimCapPing: a released claim …" | one claim per episode, re-armed under 70% / after 24 h; a released claim lets the next claim in the same episode succeed. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "/work whose final reply fails (expired token) …" | `editReply` throws; the fresh channel post still pings the owner with the spend-cap line and the pending warning, and `onSlash` rejects with the reply error. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "/session start whose reply and notice both fail …" | reply throws and the gateway post fails; the next chat reply pings the owner (`SPEND_CAP_HEADLINE <@owner>`) and carries the warning. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "a run resumed by a button pick that stops at the cap …" | after merging #198 (button asks), the reply to a button-pick run at the cap is free text with no components, pings the owner, carries a warning recorded meanwhile, and leaves no pending ask. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "collapsed answer (DISCORD-ASK-6/7) …" — "the 80% warning and the owner mention ride the edit …" | after merging #204, the thinking message is edited into the answer with the warning line and `mentionUserIds` `[owner]`, no separate reply, and the next answer carries no warning. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "a spend-cap stop collapses to plain text …" | collapsed spend-cap ask: owner pinged on the first, not the second, no components, no reply hint, no pending ask. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "collapsed edit fails → …" | edit fails → fallback reply carries the ping and the warning; edit and reply both fail → the next collapsed answer carries both (claims handed back). Fails when the finally-release or the warning on the edit is removed. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "a button pick whose run stops at the cap collapses the stub …" | the Choose stub is edited into the plain-text spend-cap ask (components cleared) with the owner pinged; no pending ask. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "chat: a spend-cap reply that failed to post …" | first reply not posted; the second reply pings the owner in the same episode. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "schedule: a spend-cap post that failed …" | post resolves `false`: no ping key stored; next tick's post pings the owner. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "a spend-cap stop is not the pending ask …" | no `pendingAsk` after a cap stop; `ok` runs the agent (ask again, no mention); a substantive reply's prompt has no "Prior clarifying question" or cap text. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "a spend-cap ask persisted as pending by an earlier build …" | a stored spend-cap `pending_ask` loads as null; a stored clarify ask loads unchanged. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` (existing spend-cap / warning / `replyWithOwnerNotice` tests), `tests/discord.ask-ping.test.ts`, `tests/discord.thin-ack.test.ts` | unchanged behaviour: once-per-episode ping, fresh-post notice, append fallback, AUTONOMY-4..6 thin-ack/cancel for clarify and stuck asks. |

Full suite: `bunx tsc --noEmit`, `bun test`, `specsync check
--require-coverage 100`, `specsync change audit`, `fledge lanes run verify
--non-interactive`.

## Where these lessons go

- `specs/agent/context.md`
- `specs/discord/context.md`
