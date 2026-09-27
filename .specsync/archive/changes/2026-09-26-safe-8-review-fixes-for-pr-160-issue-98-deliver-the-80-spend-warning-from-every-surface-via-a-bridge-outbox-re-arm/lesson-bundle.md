# Lesson bundle — safe-8-review-fixes-for-pr-160-issue-98-deliver-the-80-spend-warning-from-every-surface-via-a-bridge-outbox-re-arm

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: SAFE-8 review fixes for PR #160 (issue #98): deliver the 80% spend warning from every surface via a bridge outbox, re-arm under 70%, ping the owner once per spend-cap episode, and handle spend-cap asks in /work and /session start
- **Kind**: BugFix
- **Paths**: src/agent/spend-alerts.ts, src/agent/spend-outbox.ts, src/daemon/daemon.ts, src/discord/command-handlers/session.ts, src/discord/command-handlers/work.ts, src/discord/spend-post.ts, src/discord/work-store.ts
- **Acceptance**: A warning recorded by a run with no Discord reply (WATCH-style guard on a shared DB file, daemon, delegate worker) is posted once with an owner ping on the bridge's next post (chat, /work, /session start or schedule), and handed back when that post fails; after spend is seen under 70% of the cap a second crossing inside 24 h warns again while spend hovering between 70% and 80% does not; the owner is pinged once per spend-cap episode across chat, slash commands and schedules; /work at the cap records the task as blocked with a paused status, the ask and a spend-cap PR line, and pings the owner in a fresh post; /session start at the cap shows the ask and pings the owner; the daemon logs spend.warning and run.needs_human warn lines; fixture tests only (mocked fetch, in-memory or temp SQLite, fake gateway)

## Evidence

- Verification commit: `f463b5e8141370e2b13b9e54f8ac9b6c37c6d9e3`
- Base commit: `ede5f461fdd16166e8cfee218b0bf8e860fa5499`
- Verified by: `specsync check --spec agent --spec cli --spec discord`

## From the change's context.md

# Context

PR #160 (issue #98) implements SAFE-8 as amended ("I get a warning at 80% of
it, and at 100% the agent asks me (an Approve card to continue) instead of
refusing or quietly running up the bill") through two changes:
`safe-8-daily-spend-cap-issue-98-captured-slice-…` (ledger, prices, cap) and
`safe-8-amended-issue-98-warn-at-80-…` (warn at 80%, ask at 100%).

A review of PR #160 found:

1. (major) The 80% warning was deduped globally but shown only by Discord
   chat replies and bridge schedule posts. A crossing made by WATCH,
   `/work`, `/session start`, a delegate worker, the daemon or a schedule
   whose channel left the allowlist recorded the warning and silently used
   it up for 24 h.
2. (minor) `/work` and `/session start` ignored `result.ask`: a spend-cap
   stop showed "✅ Done", `/work` was stored `completed`, and the owner was
   not pinged. WATCH posted the ask text (amounts, env var name, restart
   hint) publicly on GitHub; the daemon told no one.
3. (minor) The chat ask ended with "Do you want to raise the cap?" and a
   "Reply to this message" hint although a reply cannot lift the cap, and
   every chat message at the cap pinged the owner.
4. (minor) "Once per crossing" was really "at most once per cap value per
   24 h": a second crossing inside 24 h stayed silent.

Constraints: the canonical requirement text for these fixes is carried by
the amended change's deltas (REQ-agent-098, REQ-discord-098, REQ-cli-098);
this change covers the implementation paths that change did not list. The
public behavior these paths change (owner pings, `/work` `blocked` status,
daemon log lines) is recorded as a public contract change there, so this
change answers `public_contract: no` and declares no spec change: it adds
no contract beyond those modified requirements. No new
env var, slash command or schema version; the Approve card (#96, draft
SAFE-18..20) stays left for HI capture.

## From the change's design.md

# Design

Full design notes: the amended change's `design.md` ("Delivery is separate
from recording", "Spend-cap ask on every surface"). Paths in this change:

- `src/agent/spend-alerts.ts` — owns `spend_alerts` (constant kinds and
  integers only; `delivered_at` added to an older table). `warn` rows are
  recorded pending; `rearm` rows (per cap value) are written when a settle
  or a reservation sees spend under 70% while a `warn` or `cap` row is in
  force; `cap` rows record an owner ping for a spend-cap stop. Armed = no
  row of that kind for the cap value newer than its last `rearm` and < 24 h
  old. Claims run in one IMMEDIATE transaction.
- `src/agent/spend-outbox.ts` — `createSpendAlertOutbox({ db, env })`:
  `takeWarning(fallback)` claims pending warnings (current spend; dropped
  when back under 80%; `release()` on a failed post; no DB ⇒ the run's own
  warning) and `claimCapPing()` (once per episode; fails open to pinging).
- `src/discord/spend-post.ts` — `askPingOwner`, `askNeedsOwner`,
  `takeSpendWarning`, `ownerAskNoticeLine`, `slashOwnerNotice`,
  `replyWithOwnerNotice`: shared by the chat reply (and its thin-reply
  restatement), `/work`, `/session start` and schedule posts. Stuck and
  spend-cap asks ping the owner; clarify addresses the requester
  (AUTONOMY-4). Slash owner notices are a fresh channel post (a
  deferred-reply edit may not notify a mention), else appended to the reply.
- `src/discord/command-handlers/work.ts` / `session.ts` — handle
  `result.ask` through `formatAskReply` (paused status, ask in the reply,
  spend-cap PR line for `/work`) and send the owner notice.
- `src/discord/work-store.ts` — `WorkTaskStatus` gains `blocked`.
- `src/daemon/daemon.ts` — logs `spend.warning` and `run.needs_human` (warn)
  from `ScheduleRunFinished`.

## From the change's testing.md

# Testing

Fixtures only: mocked fetch, in-memory or temp-file SQLite, a fake gateway,
an injected agent and logger. No network, no real keys, no git worktrees.

- `tests/agent.spend-ask.test.ts`: the reviewer's repro now warns on the
  second crossing; a reservation re-arms; spend between 70% and 80% does not
  re-warn; outbox without DB, without tables, claim / release / moot drop,
  `claimCapPing` episodes (re-arm under 70%, 24 h), migration of an older
  `spend_alerts` table.
- `tests/discord.spend.test.ts`: a WATCH-style guard on a shared DB file
  crosses 80% and the next bridge chat reply pings the owner once; `/work`
  delivers a pending warning as a fresh post; chat asks at the cap ping once
  and never carry the reply hint, re-armed after spend under 70%; `/work`
  at the cap is `blocked`, paused, shows the ask and the PR line, pings once;
  `/session start` at the cap; `replyWithOwnerNotice` fallback; a schedule
  ask in an already-pinged episode has no mention; daemon warn log lines.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
