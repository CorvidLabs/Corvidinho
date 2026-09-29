---
id: condense-long-chats-at-about-80-of-the-model-s-window-with-the-task-and-latest-instruction-pinned-resume-from-the
state: approved
type: feature
base_commit: d589638c38f27503373601bb256ee6207fb822f9
---

# Condense long chats at about 80% of the model's window with the task and latest instruction pinned, resume from the summary after the soft TTL, and keep each thread's summary 30 days (SESSION-5/6, SESSION-3.a, AGENT-6.a; #72)

## Intent

Condense long chats at about 80% of the model's window with the task and latest instruction pinned, resume from the summary after the soft TTL, and keep each thread's summary 30 days (SESSION-5/6, SESSION-3.a, AGENT-6.a; #72)

## Affected Canonical Specs

- `discord`
- `watch`

## Acceptance Criteria

- When a Discord session's prompt (replayed conversation plus the new message) reaches about 80% of the model's context window (CORVIDINHO_LLM_CONTEXT_TOKENS, default 8192 tokens, chars/4, never past the 32000-char transport ceiling) the oldest turns fold into a scrubbed summary stored with the session while the opening request and the newest human turn stay word for word; after a restart or with a smaller window the prompt picks up from that summary; after the soft TTL the user's reply to one of the session's answers, or their message in its thread, passes the channel, actor and mute gates and starts a new session seeded with the old session's summary and last turns instead of no answer; each Discord conversation and each WATCH issue or PR thread keeps its summary and last 20 turns scrubbed for 30 days after its last update in schema v12 conversation_threads and is then purged; WATCH follow-ups on the same issue or PR get that thread's conversation replayed; SessionStore.forgetConversations and forgetConversations(db, person) delete a person's conversations; tests/session.condense.test.ts, tests/store.conversation.test.ts, tests/discord.session-resume.test.ts and tests/watch.conversation.test.ts cover each and fail on the base sources

## No-spec Rationale

Not applicable
