---
change: condense-long-chats-at-about-80-of-the-model-s-window-with-the-task-and-latest-instruction-pinned-resume-from-the
artifact: design
---

# Design

- `src/store/conversation.ts` (new, shared by Discord and WATCH): the window
  (`resolveContextWindowTokens`: `CORVIDINHO_LLM_CONTEXT_TOKENS`, default
  8192, min 1024), the budget (`condenseBudgetChars` = floor(window × 0.8) × 4,
  capped at 32000), the pure fold (`condenseConversation`: oldest unpinned
  turn first while block + blank line + new message >= budget; pinned = the
  opening human turn and the newest human turn; each fold appends
  `summaryPoint` = `- <Label>: <first 160 chars>`; `appendSummary` caps the
  summary at a third of the budget by shortening older points to 80 chars,
  then leaving them out with a count line; when only pinned turns are left the
  summary shrinks), `boundConversation` (keep the opening human turn + last N,
  fold the rest), the block renderer (`formatConversationBlock`: header, the
  opening human turn, the summary label and points, the other turns, footer;
  no blank line; the old omitted-marker path as a ceiling safety net) and
  `ConversationStore` over `conversation_threads`.
- Schema v12: `conversation_threads(id, surface, thread_key, user_id,
  session_id, project, summary, turns JSON, participants JSON,
  bot_message_ids JSON, updated_at)`, indexes (surface, thread_key, user_id), (session_id),
  (updated_at). `summary` + JSON `turns` in `SCRUB_TARGETS`.
- Discord `SessionStore`: `summaries` / `conversationIds` maps;
  `threadPrompt` condenses and, on a fold, rewrites the session's turn rows
  and saves the summary to the session's record (the live record carries the
  summary; live turns stay in `discord_session_turns`); `loadFromDb` loads a
  live session's summary and keeps the conversation of rows found expired;
  `purgeIfExpired` / `endSession` keep the conversation (summary, turns,
  answer ids from `byBotMessageId`) before removing; `recordTurn` clips by
  role and folds turns past 200 into the summary; `retainedForReply`,
  `retainedForThread`, `resumeFromRetained` (reads the record again, then a
  new session seeded with its summary and turns, in its project, record
  re-pointed to it; nothing when the record is gone), `forgetConversations`,
  `purgeExpiredConversations`. Every conversation DB step is best effort.
- Router: `resumeRetained` after the channel gate, on the thread path (no own
  live session) and the reply path (no live session for the referenced
  answer): own conversation only, same place only, actor + mute/rate gates,
  continue the live session already carrying the record, else
  `start_session` from `resumeFromRetained`.
- Bridge: `store.threadPrompt` replaces `withSessionThread` on chat and
  button-pick runs; the store gets `contextWindowTokens` from the env; an
  hourly unref'd purge timer, cleared on stop.
- WATCH poller: `ConversationStore` on the poller's DB; before each run the
  thread's record (`issue:<repo>#<n>`) is condensed and replayed under
  `WATCH_THREAD_HEADER`; after it the event prompt and the run's summary are
  saved (participants = senders); each cycle purges.
- Rejected: a model-written summary (a second model call per fold, spend, a
  provider dependency in the bridge — the captured text does not ask for one);
  keeping expired `discord_sessions` rows for 30 days (every lookup and
  `/session list` would have to skip them); storing summaries in `memories`
  (soft-deleted history per update, and the memory inject would replay them
  to every run); passing the prompt over stdin/a file to lift the 32000-char
  ceiling (a CLI surface change not asked for); a scheduler-tick purge (the
  daemon has no session store; reads/writes plus a bridge timer and the WATCH
  cycle purge instead).
