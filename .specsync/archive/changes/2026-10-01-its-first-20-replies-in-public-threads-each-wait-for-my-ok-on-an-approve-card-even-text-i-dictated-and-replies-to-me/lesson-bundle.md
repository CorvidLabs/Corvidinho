# Lesson bundle — its-first-20-replies-in-public-threads-each-wait-for-my-ok-on-an-approve-card-even-text-i-dictated-and-replies-to-me

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Its first 20 replies in public threads each wait for my OK on an Approve card, even text I dictated and replies to me (AUTONOMY-10, AUTONOMY-10.a)
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/discord/public-reply-gate.ts, src/discord/bridge.ts, src/discord/gateway.ts, src/discord/agent-client.ts, src/discord/thinking-status.ts, src/discord/slash-finish.ts, src/discord/slash-types.ts, src/discord/command-handlers/session.ts, src/discord/command-handlers/work.ts, src/scheduler/service.ts, plugins/discord/send-file.ts, tests/discord.public-reply-gate.test.ts, tests/must-ask.boundary.test.ts, specs/discord/discord.spec.md, specs/discord/testing.md, docs/discord.md, docs/DISCORD-GO-LIVE.md
- **Acceptance**: AUTONOMY-10 and AUTONOMY-10.a (already captured in hi/autonomy.md; Leif's 2026-09-28 interview, round 13 on 2026-09-30) hold for public-thread replies: while fewer than 20 held replies were approved (schema_meta key public_thread_replies_approved, no schema change), every post the bridge makes that carries model text in a public thread (a Discord PublicThread including forum and media posts, or an AnnouncementThread, asked of the gateway at post time; a lookup that fails counts as public) — a chat answer, an ask pick or Answer form answer, a question restated after a thin ack, a /session start or /work answer, a schedule's result or question — shows only the fixed line 'waiting for the owner's OK before replying here' and waits for the owner's plain 'reply' Approve card on the #316 engine (the reply text verbatim before the card, scrubbed and fence-safe, SAFE-18); Approve posts exactly the text the card showed and counts toward 20; Deny, a lapse (5 min), a stop or the bridge closing posts none of it, leaves no question pending and does not count (SAFE-20); with no owner nothing that waits is posted; even the owner's own messages and text the owner dictated wait; fixed harness text (progress embed, Stop, DISCORD-3.b failed-run lines, the spend-cap paused line, pings, acks, notices, wait notes) never waits; a held clarify question is set pending only once it is posted; a per-spawn CORVIDINHO_DISCORD_REPLY_PUBLIC_THREAD stamp makes discord-send-file ask on a plain channel-post card there; the Stop button, failed-run and spend-card paths keep working; tests/discord.public-reply-gate.test.ts (including one real task run against the fake model) fails on the base sources and passes on the branch

## Evidence

- Verification commit: `d45f5e8a52e0347d7fedf479c6f2903e9a976662`
- Base commit: `b84c75fc3e98ce9d51c30ea215f538d53c18ded8`
- Verified by: `specsync check --spec discord --spec plugins`

## From the change's context.md

# Context

Issue #97 (M4 "Safe autonomy"), the replies half of AUTONOMY-10 / 10.a. Both
criteria are already captured in `hi/autonomy.md` (AUTONOMY-10 from Leif's
2026-09-28 interview; AUTONOMY-10.a from round 13 on 2026-09-30, captured in
#319), so this change captures nothing new. #319 built the channel-post half
(every `discord-post-message` waits for the `mustask-post` card); the
2026-09-30 rollup on #97 lists "each of its first 20 replies in public
threads" as the one missing piece of AUTONOMY-10 / 10.a.

What was wrong on main (b84c75f):

- A chat answer, an ask pick's answer, a restated question, a `/session
  start` or `/work` answer and a schedule's result or question went straight
  into a public thread (a forum post, an announcement thread) with no card,
  whatever the owner had approved so far.
- `discord-send-file` attached in a public thread with no card.
- The gateway had no way to say whether a channel is a public thread.

Constraints: specs only through SpecSync; no schema version bump (main is
v15; the count is a `schema_meta` key); no new env var or config key beyond
the bridge-to-run stamp; v1 is off-chain; #232/#233 and the parallel
safe3a-cli (`cli.ts`, `shell-gate.ts`) and repo-ways-3 (`loop.ts`,
`src/work/pr.ts`, `plugins/files`) slices are untouched. The Stop button
(#337), failed-run replies (#340, DISCORD-3.b) and the spend card must keep
working. Leif's 2026-09-26 comment on #97 ("the owner can revoke" the
automatic replies after 20) is not captured, so it is not built.

## From the change's design.md

# Design

- **One gate**, `src/discord/public-reply-gate.ts`:
  `createPublicReplyGate({ db, owner, lookup, post, edit, remove, deliver })`
  → `isPublicThread` (the gateway's lookup at post time; a throw is public),
  `mustHold` (count < 20, then the lookup), `hold(input)` and `close()`.
  `hold` returns the text to post (as given when it need not wait, else the
  stored, scrubbed text of the approved card) or a no (`denied` | `expired` |
  `stopped` | `no-owner` | `unavailable`). It records the `reply` request
  first (no card ⇒ no hold line), runs a card pass, shows the hold line
  (`showHold` on the progress message or deferred slash reply, else a note
  it posts and later removes or turns into the not-posted line), waits with
  `ApprovalStore.waitForDecision` (signal = the run's stop and the gate's
  close), then consumes and counts in one IMMEDIATE transaction.
- **The count**: `schema_meta` key `public_thread_replies_approved`,
  incremented only when an approval is used; read as 0 when unreadable.
- **Public thread**: `isPublicThreadType(type)` = Discord types 11 / 10 (fixed
  API numbers, so a discord.js enum without a member cannot match
  `undefined`); `GatewayHandlers.isPublicThread` in the live gateway fetches
  the channel (cached by discord.js).
- **Card kind**: `publicReplyApprovalKind` = `storedApprovalKind` kind
  `reply`, class plain, audit `public-reply`, "nothing was posted"; the
  bridge registers it beside forget, must-ask and spend.
- **Surfaces** (only where the body carries model text — `!stopped &&
  (ask ? reason !== "spend-cap" : ok)`): chat and ask-pick answers hold on
  the progress message before the pending ask is set, the turn recorded and
  the answer finalized; a no turns the answer into the fixed line (or ⏹
  Stopped when the run was stopped; nothing when the bridge closed, its
  in-flight row kept). The thin-ack restatement holds with a note.
  `/session start` and `/work` hold through `holdSlashReply` (slash-finish)
  before `setPendingAsk`, the agent turn and `finishSlashWithOwnerNotice`; a
  no finishes with the line only. The scheduler marks its result and ask
  posts `modelText`; the bridge's poster holds them and answers true for a
  final no, false for a stop / no owner / no card.
- **Files**: the bridge computes `mustHold(channel)` before each chat, ask,
  `/session start` and `/work` spawn and passes `replyPublicThread`; the
  spawn client writes the stamp; `sendFileMustAsk` raises the must-ask
  gate's `public` class card (caption + `[attachment: …]`) when stamped and
  still under 20, after the handler's own refusals.
- **Stop**: the hold's signal is the run's turn signal, so the Stop button
  and stop words end the wait; `bridge.stop()` calls `close()`.

## From the change's testing.md

# Testing

Stub agents, a dry-run `startBridge` whose fake gateway records replies,
note edits and deletes and answers `isPublicThread` for the test,
in-memory SQLite, the real card engine, a `SchedulerService` with a
recording poster, a fake `corvidinho` bin for the spawn stamp, and one real
`task run` against the localhost fake model (`startFakeLlm`). Cards are
decided through `ApprovalStore.decide` (or one owner press on the engine);
`setPublicReplyTestHooks` shortens the poll and the lapse. No network, no
token, no live Discord.

Fail-on-base proof: with the base's (b84c75f) ten modified source files
swapped in (`plugins/discord/send-file.ts`,
`src/discord/{agent-client,bridge,gateway,slash-finish,slash-types,thinking-status}.ts`,
`src/discord/command-handlers/{session,work}.ts`, `src/scheduler/service.ts`;
the new `src/discord/public-reply-gate.ts` kept so imports resolve),
`bun test tests/discord.public-reply-gate.test.ts` gave 11 pass, 17 fail;
restored, 28 pass, 0 fail. The 11 that pass on the base are the new module's
own units (public-thread types, the count, `mustHold`, the hold and the
engine card) and "outside a public thread nothing waits"; every bridge
surface (chat, Stop, stamp, thin ack, ask pick, `/session start`, `/work`,
schedules), the send-file card and the fake-model run fail on the base (the
answer goes straight out, no card, no stamp). `tests/must-ask.boundary.test.ts`
with the base's `send-file.ts`: 4 pass, 1 fail (no `mustAsk`); restored, 5 pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-099` | `tests/discord.public-reply-gate.test.ts` ("public threads and the approved count") | Types 11 and 10 are public, 12 / 0 / 15 / `undefined` / `"11"` are not; the count is 0, then 1, 2 in `schema_meta` `public_thread_replies_approved`, garbage reads 0, 20 stops the waiting; `mustHold` asks per post, a throwing lookup is public, no lookup once 20 were approved. |
| `REQ-discord-099` | same file ("the hold") | Not public: posted as is, no card. Public: a plain `reply` card (text verbatim, target `Discord thread <#thread-public> (thread-public)`, amount `1 reply (N characters)`, title `Public-thread reply (AUTONOMY-10) · 0/20 approved · from chat`), a card pass at once, the hold note; Approve removes the note, returns the text, the request `used`, count 1; Deny → `Not posted — the owner didn't OK this reply.` on the note; a lapse → `expired`; a stop and `close()` → `stopped`; no owner → no card; a key shows and posts as `[redacted:openai-key]`; on the engine the text DM (quoted data, fences intact, `@everyone` defanged) comes before the card and one owner press approves it. |
| `REQ-discord-099` | same file ("a chat answer in a public thread") | The owner's own answer waits (hold line on the progress message, Stop button kept, nothing of it out) and is posted exactly on Approve; Deny → the line, no answer text anywhere, the turn records the line; a clarify question is pending only after Approve; a plain channel, a private thread or 20 approved → no card; a failed run's line, a spend-cap stop → no card; the Stop button → `⏹ Stopped`, the card `expired`; the spawn is stamped `replyPublicThread` true only while it waits. Fail on base. |
| `REQ-discord-099` | same file ("a restated question and an ask pick") | A thin ack's restatement waits behind a note, then is posted with its Answer button and the note deleted, or the note becomes the not-posted line; an ask pick's answer waits on the stub and is posted exactly (count 2). Fail on base. |
| `REQ-discord-099` | same file ("/session start and /work in a public thread") | The typed topic / description and the question are on the card; Deny posts only the line and leaves no pending question; Approve posts exactly the card's text and sets the question pending; outside a public thread nothing waits. Fail on base (except the last). |
| `REQ-discord-099`, `REQ-discord-741` | same file ("a schedule's posts") | The result and the question are posted `modelText: true`, the `❌` line without it; on the bridge a schedule's result in a public thread waits behind a note, a denied one is never posted nor retried, the next approved one goes out. Fail on base. |
| `REQ-discord-099` | same file ("discord-send-file in a public thread") | `mustAsk` asks (class `public`, `Here is the chart\n[attachment: chart.png]`) only with the stamp, not in a dry run, not for a refused call or a missing acting user, not after 20; through `mustAskGate` a denied `mustask-post` card attaches nothing; the spawn client writes `1` or empty, never the inherited stamp. Fail on base. |
| `REQ-discord-099` | same file ("end to end with the fake model") | A real `task run` against the fake model answering in a public thread waits for the card (its text the model's answer) and then posts exactly it; count 1. Fail on base. |
| `REQ-discord-097` | `tests/must-ask.boundary.test.ts` | The must-ask builtins now include `discord-send-file` (classed only with the stamp); its everyday call (no stamp) asks nothing; the channel-post half is unchanged (`tests/must-ask.*`, `tests/discord.approval-cards.test.ts` pass as before). |

## Automated coverage

- `tests/discord.public-reply-gate.test.ts` (28 tests).
- Updated: `tests/must-ask.boundary.test.ts` (the classed builtins).
- Unchanged suites over the touched files still pass (`bun test`, all
  files): the Stop button (`tests/discord.stop-run.test.ts`), failed-run
  replies (`tests/discord.failed-reply.test.ts`), the spend card
  (`tests/discord.spend-card.test.ts`), mentions
  (`tests/discord.allowed-mentions.test.ts`), schedules
  (`tests/scheduler.*.test.ts`) and `discord-send-file`
  (`tests/discord.send-file.test.ts`).

## Where these lessons go

- `specs/discord/context.md`
