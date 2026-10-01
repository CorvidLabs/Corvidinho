---
change: its-first-20-replies-in-public-threads-each-wait-for-my-ok-on-an-approve-card-even-text-i-dictated-and-replies-to-me
artifact: testing
---

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
