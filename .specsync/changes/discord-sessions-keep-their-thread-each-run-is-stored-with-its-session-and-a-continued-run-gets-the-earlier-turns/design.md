---
change: discord-sessions-keep-their-thread-each-run-is-stored-with-its-session-and-a-continued-run-gets-the-earlier-turns
artifact: design
---

# Design

- `src/discord/session-thread.ts` (new, pure + table DDL):
  `SessionTurn { role: "human" | "agent"; content; createdAt }`;
  `SESSION_THREAD_BUDGET_CHARS` 6000, `SESSION_THREAD_TURN_MAX_CHARS` 1500,
  `SESSION_THREAD_MAX_TURNS` 200, `SESSION_THREAD_HEADER` /
  `SESSION_THREAD_FOOTER`, `formatSessionThreadOmitted`, `clipTurnText`.
  `formatSessionThread(turns)` returns "" or the whole block when it fits;
  otherwise the opening turn, one omitted-count marker, and the newest turns
  that fit (walking back from the newest). With the default budget and clip
  the newest turn always fits. `withSessionThread(prompt, turns)` prepends
  the block. `answerTurnText(body, ask)`: "" for a spend-cap stop, question +
  choices for a button ask, else the body. `ensureSessionTurns(db)` creates
  `discord_session_turns (id INTEGER PK AUTOINCREMENT, session_id → 
  discord_sessions ON DELETE CASCADE, role, content, created_at)` + index.
- `SessionStore`: `turns: Map<sessionId, SessionTurn[]>`. Constructor with a
  DB calls `ensureSessionTurns` then `loadFromDb`, which (after dropping
  expired sessions) deletes orphan turn rows and loads the rest for live
  sessions. `recordExchange(session, human, answer)` is a no-op unless the
  session is still the live one; each turn is `scrubSecrets`'d then clipped
  (scrub first, so a cut never leaves half a token), empty turns skipped,
  capped at MAX (drop index 1), then written in one transaction (inserts +
  the same cap as a DELETE); a DB error is logged, memory keeps the turn.
  `threadFor(session)` returns a copy. `removeLocal` / `deleteFromDb` drop
  turns with the session (end, TTL purge, load-time expiry).
- `bridge.ts`: chat path — after the pending-ask wrapper,
  `agentPrompt = withSessionThread(agentPrompt, store.threadFor(session))`
  (identity/memory/images are added after, as before); after the posted
  `body` is known, `store.recordExchange(session, prompt,
  answerTurnText(body, pendingToStore ?? askRaw))`. Button pick — the same
  block ahead of the answered-question wrapper; record `(label, answer)`.
  `humanText` unchanged (raw message / label).
- `/session start` and `/work`: record `(topic|description, summary)`;
  their ask is text, so `answerTurnText` gets reason + question only.
- `src/store/scrub.ts`: `SCRUB_TARGETS` adds
  `{ table: "discord_session_turns", columns: ["content"] }`.
- Not changed: `SCHEMA_VERSION` (10), `agent-client.ts` / `execute.ts`
  (the block rides in `--task`), WATCH, CLI, router, TTL.
