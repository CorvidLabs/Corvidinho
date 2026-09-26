# Lesson bundle — autonomy-4-7-clarify-pings-requester-thin-ack-restates-pending-ask-cancel-clears-joke-impossible-witty-decline-package

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: AUTONOMY-4..7 clarify pings requester, thin-ack restates pending ask, cancel clears, joke/impossible witty decline; package 0.0.20
- **Kind**: Feature
- **Specs**: discord, agent
- **Paths**: src/discord, src/agent, src/scheduler, src/store, tests, hi, package.json, CHANGELOG.md, STATUS.md
- **Acceptance**: AUTONOMY-4: formatAskReply clarify pings requesterDiscordId (owner only when stuck or requester===owner); AUTONOMY-5/6: session.pendingAsk persisted; thin ack restates ask without clearing blocked or running agent to done; cancel clears pending; substantive continue answers; AUTONOMY-7: ASK_AGENT_SYSTEM_INSTRUCTIONS covers joke/impossible witty decline; package 0.0.20; fixture tests for ping targets, thin-ack restate, cancel clear; SpecSync+fledge verify green

## Evidence

- Verification commit: `cbe5be73671cb3e3e2c5ba41ff7ae5ddf2d63d7f`
- Base commit: `3af288a04306b7463f1275d4db93001ca51bede2`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins`

## From the change's context.md

# Context

Leif confirmed AUTONOMY-4..7 (append to captured AUTONOMY-1..3). Live dogfood
on v0.0.19 showed three root causes: (1) `formatAskReply` always pings the
owner on clarify; (2) thin replies like `ok` on a blocked session clear via
the agent treating them as answers; (3) joke/impossible physics asks open
ask-human / long MCQs.

Constraints: CorvidLabs/Corvidinho only; do not touch Corvidinho-run live
bridge worktree while implementing; SpecSync full cycle; bump to 0.0.20;
PRs via `gh` as corvid-agent. Prefer bridge-level thin-ack gate for
reliability over relying on the model.

## From the change's design.md

# Design

**ask-ping:** `FormatAskReplyOpts.requesterDiscordId`. Clarify → mention
requester; stuck → mention owner. `pinged` = any mention; `ownerPinged` =
owner in mentions. Bridge passes `msg.authorId`; scheduler passes
`createdByUserId` for clarify.

**pendingAsk:** `SessionStub.pendingAsk: HumanAsk | null`; SQLite column
`discord_sessions.pending_ask` (JSON, schema v8). Set when result has ask;
clear on cancel or substantive continue start (and when a non-ask result
finishes).

**thin-ack:** pure `isThinAck` / `isCancelAsk` in `src/discord/thin-ack.ts`.
Bridge continue: if pendingAsk && thin → formatAskReply restate, no agent; if
cancel → clear + short ack; else prepend prior-question context and run agent.

**AUTONOMY-7:** one sentence on `ASK_AGENT_SYSTEM_INSTRUCTIONS`.

## From the change's testing.md

# Testing

- Unit: `formatAskReply` clarify→requester, stuck→owner, requester===owner.
- Unit: `isThinAck` / `isCancelAsk` fixtures (ok/k/sure/emoji vs real answers).
- Bridge: blocked ask sets pendingAsk; thin continue restates without agent done;
  cancel clears; substantive continue runs agent with prior-question context.
- Scheduler: clarify pings createdBy; stuck pings owner; dedupe still works.
- `bun test` + `fledge lanes run verify --non-interactive` + `specsync check`.

## Where these lessons go

- `specs/discord/context.md`
- `specs/agent/context.md`
