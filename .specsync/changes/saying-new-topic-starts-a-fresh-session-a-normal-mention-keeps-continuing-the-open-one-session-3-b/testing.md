---
change: saying-new-topic-starts-a-fresh-session-a-normal-mention-keeps-continuing-the-open-one-session-3-b
artifact: testing
---

# Testing

`tests/discord.new-topic.test.ts`: `newTopicRequest` units; pure
`routeMessage` with a `SessionStore`; a dry-run bridge with a fake gateway,
the in-memory outbound, stub agents (immediate or gated until the test
finishes them), the configured model from the fake LLM fixture
(`useConfiguredModel`; no model is called), an in-memory SQLite DB and temp
non-git projects. No network, no key or token. Every `bun test` / `fledge`
run used a private `TMPDIR` under `/home/user/coord/tmp`, removed after.

Fail-on-base proof: with the base's (e1a24ed2) sources swapped in for the
four modified files (`message-router.ts`, `types.ts`, `session-store.ts`,
`bridge.ts`; the branch's new `new-topic.ts` kept so the test's imports
resolve), `bun test tests/discord.new-topic.test.ts` gave 5 pass, 10 fail;
restored, 15 pass, 0 fail. The 10 are every router and bridge case that
expects a fresh session (the base continues the open session instead, or
runs `new topic.` as a message); the 5 that pass on the base are the three
`newTopicRequest` units (the new module) and the two gate tests (a refused
or no-longer-allowed `new topic` leaves the open session alone — behaviour
the base already has).

Re-proved after merging main (86d68cd0, with PLUGIN-5.a and AGENT-3.c):
the same four files from 86d68cd0 swapped in gave the same 5 pass, 10
fail; restored, 15 pass, 0 fail.

Review fixes (three new tests, 18 in all): the fresh session is held busy
while `new topic` waits, and the open session is not parked while a message
of its own waits behind it. Main's (86d68cd0) five files (`run-control.ts`
too) swapped in: 5 pass, 13 fail. The PR's earlier head (810433ca)
`bridge.ts` and `run-control.ts` swapped in: exactly the 3 new tests fail
(`waitingBehind` missing; the fresh session purged mid-wait, so the
message after the request is dropped; the reply to the old answer dropped
when the open session is parked). Restored: 18 pass, 0 fail.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-479` | `tests/discord.new-topic.test.ts` ("the phrase, any case, …", "nothing after the phrase …", "the phrase anywhere else …") | `new topic: X` / `New Topic - X` / `NEW TOPIC, X` / `new topic X` / `new topic:X` / `new topic — X` give `X` (mention trailer kept); `new topic`, `new topic.`, `new topic!`, `new topic:` give `""`; `tell me about the new topic`, `a new topic: X`, `new topics …`, `new topic's …`, `renew topic`, `newtopic: X` give null. |
| `REQ-discord-479` | `tests/discord.new-topic.test.ts` (routeMessage describe) | A plain @mention and `tell me about the new topic` continue; `new topic: …` is `new_topic` with the open session, a new session and the request, and the next @mention finds the fresh one; with nothing open, `new_topic` without `open` and another user's session untouched; thread message and reply count; a plain channel message stays `no_mention`. Fail on base. |
| `REQ-discord-479`, `REQ-discord-019` | `tests/discord.new-topic.test.ts` ("'new topic: X' starts a new session id; …") | New session id, `resume: false`, `humanText` the request, nothing of the open session replayed, the phrase not in the prompt, the open session gone; the next two @mentions (one saying "the new topic" mid-text) continue the fresh session. Fail on base. |
| `REQ-discord-479` | `tests/discord.new-topic.test.ts` ("the parked conversation is kept …") | After `new topic`, a reply to the old session's answer starts a session from its kept conversation (SESSION-3.a) without the new topic's words. Fail on base. |
| `REQ-discord-479` | `tests/discord.new-topic.test.ts` ("in a thread …", "a reply to its answer …") | A thread message without a mention and a reply to an answer, each beginning with `new topic`, start fresh there; the next thread message continues the fresh one. Fail on base. |
| `REQ-discord-479` | `tests/discord.new-topic.test.ts` ("'new topic' alone …") | `new topic.`: only `NEW_TOPIC_ACK` (one reply to the message), no run, the open session gone; a reply to the ack, then an @mention, run in the fresh session with nothing replayed. Fail on base. |
| `REQ-discord-479` | `tests/discord.new-topic.test.ts` ("a 'new topic' sent while a run is going waits …") | No second run or progress message and the open session kept while its run goes; after it, the request runs in a new session and the open one is gone; a message sent after `new topic` waits behind it and continues the fresh session. Fail on base. |
| `REQ-discord-479`, `REQ-discord-302` | `tests/discord.new-topic.test.ts` ("'stop' while a 'new topic' waits …") | A `stop` @mention while `new topic: …` waits aborts the open session's run once and gets `⏹ Stopping the run.`; the request then runs, not aborted, in a new session and the open session is gone. Fail on base. |
| `REQ-discord-479` | `tests/discord.new-topic.test.ts` ("every gate still comes first …", "muted while it waits …") | Muted, deny-listed and off-allowlist `new topic` run nothing and leave the open session open (a plain mention then continues it); muted while waiting: nothing parked, run, sent or replied. Pass on base too (guards). |
| `REQ-discord-479` | `tests/discord.new-topic.test.ts` ("SessionRunControl.waitingBehind …", "a wait longer than the soft TTL …", "a reply to one of the open session's answers sent while …") | `waitingBehind` is true only while a later turn of the same session is queued; with the store clock past the TTL mid-wait the request runs in a live fresh session and the message after it continues it; a reply to an old answer sent mid-wait runs in the old session with its turns, the request runs fresh, and the next @mention reaches the fresh session. Fail on the earlier head. |
