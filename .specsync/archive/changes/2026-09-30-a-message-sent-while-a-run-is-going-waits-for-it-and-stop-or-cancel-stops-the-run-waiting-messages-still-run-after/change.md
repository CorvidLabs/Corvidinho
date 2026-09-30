---
id: a-message-sent-while-a-run-is-going-waits-for-it-and-stop-or-cancel-stops-the-run-waiting-messages-still-run-after
state: archived
type: feature
base_commit: 41ec90df25d36a9cb4b09c1938860b6cfc70e9fa
---

# A message sent while a run is going waits for it, and stop or cancel stops the run; waiting messages still run after (AGENT-3.a, AGENT-3.b)

## Intent

A message sent while a run is going waits for it, and stop or cancel stops the run; waiting messages still run after (AGENT-3.a, AGENT-3.b)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- AGENT-3.a (captured on main from Leif's 2026-09-28 interview): 'In Discord I can stop a run with a Stop button or by saying stop or cancel, and so can the person who asked; a message sent while a run is going waits for it instead of starting a second run.' AGENT-3.b (captured in this change's PR with hi, Leif's 2026-09-30 decision, round 13 of the 2026-09-28 record): 'After I stop a run, messages that were waiting still run, in order.' This change builds the queue and the stop/cancel text (AGENT-3.a is partial: the Stop button is the next slice, and stopping schedule runs is later). Observable outcomes: (1) per Discord session one run at a time: a chat message, an ask pick or Answer submit sent while a run of that session is going waits for it, first in first out, instead of starting a second run; runs of different sessions go in parallel; a waiting message gets no new indicator (its normal progress message comes when its turn starts) and its in-flight row (REQ-discord-311) is recorded from when it starts waiting; after waiting, a session that ended or idled out, or a requester forgotten meanwhile, runs and posts nothing; /session start and /work take their new session's turn. (2) 'stop' or 'cancel' as the whole message from the requester in their session, or from the requester or the owner as a reply to the running run's progress message (the stop_run route, checked right after the channel gate and before the thread and bot-message lookups, past the actor and mute/rate gates), aborts that run's signal once (idempotent), which kills its whole process tree, answers with one short ack, and the progress message becomes '⏹ Stopped' with the DISCORD-15/15.a footer; a question the run raised is dropped; an Approve card the killed run waited on closes as a no (SAFE-20) on the card pass that runs after the stop; a stopped /work is failed ('stopped') and opens no PR. (3) Waiting messages are never dropped by a stop and run after it in order (AGENT-3.b). (4) With nothing running, 'cancel' keeps today's behaviour (clears open asks) and 'stop' is ordinary text. (5) Bridge stop aborts every run still going (no post) and starts no waiting message; their in-flight rows stay for the next start's interrupted notice. No new env var, config key, slash command, table or schema change. Tests: tests/discord.run-queue.test.ts and tests/discord.stop-run.test.ts (stub agents and fake agent bins, fake LLM fixture model; no network), failing on the base (af4597e) and passing on the branch.

## No-spec Rationale

Not applicable
