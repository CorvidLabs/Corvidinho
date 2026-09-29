---
change: condense-long-chats-at-about-80-of-the-model-s-window-with-the-task-and-latest-instruction-pinned-resume-from-the
artifact: tasks
---

# Tasks

- [x] Confirm SESSION-5, SESSION-6, SESSION-3.a and AGENT-6.a are captured on the stacked base (`grep` in `hi/session.md` / `hi/agent.md`, `hi check` passes); not captured again.
- [x] `src/store/conversation.ts`: window + 80% budget + 32000-char ceiling, pure fold with pinned task / latest instruction, bounded extractive summary, block renderer, `ConversationStore`, `forgetConversations`.
- [x] Schema v12 `conversation_threads` (forward-only migration) and its `SCRUB_TARGETS` entry.
- [x] `SessionStore`: `threadPrompt`, summary stored with the session and loaded on restart, conversation kept on idle-out / end / expired-at-load, turns past 200 folded, `retainedForReply` / `retainedForThread` / `resumeFromRetained`, `forgetConversations`, `purgeExpiredConversations`.
- [x] Router SESSION-3.a path (reply and thread message, own conversation, same place, gates first, continue a live carrier).
- [x] Bridge: `threadPrompt` on chat and button-pick runs, window from env, hourly purge timer.
- [x] WATCH poller: replay the issue/PR thread's conversation into follow-ups, record each run, purge each cycle.
- [x] Tests (4 new files, 31 tests) fail on the base sources (see testing) and pass on the branch; renderer unit test and the two schema-version pins updated.
- [x] Docs, spec prose, `files:`, testing notes; deltas Added REQ-discord-472 / REQ-watch-472, Modified REQ-discord-019 / REQ-discord-072 / REQ-watch-037.
- [x] Review fixes: a resume reads the record again (a carrier that idled out on the lookup keeps its newer turns first), keeps the conversation's project (`conversation_threads.project`, SESSION-WORKTREE-4), a kept session counts its 30 days from its last activity, a fold stores the summary before rewriting the turn rows, human turns kept up to 8000 (a whole WATCH event prompt); four tests that fail on the reviewed sources.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
