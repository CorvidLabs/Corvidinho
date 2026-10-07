---
change: saying-new-topic-starts-a-fresh-session-a-normal-mention-keeps-continuing-the-open-one-session-3-b
artifact: research
---

# Research

- Sources: the interview record (round 16 "SESSION-3 new topic"; round 8
  SESSION-3.a; round 7 / 13 AGENT-3.a and AGENT-3.b), `hi/session.md`,
  `hi/agent.md` (AGENT-3.a: "a message sent while a run is going waits for
  it instead of starting a second run").
- `routeMessage` (`src/discord/message-router.ts`) continues a session on
  four paths after the gates: the author's own thread session, a reply to a
  tracked answer of their session, the SESSION-3.a retained paths
  (`resumeRetained`: a live session carrying the record, else a new session
  seeded from it) and the @mention lookup `getByUserChannel`. The prompt is
  `stripMentions(content)`: whitespace collapsed, mentions removed, an
  IDENTITY-5 `[mentioned: …]` trailer appended.
- Idle expiry (`SessionStore.purgeIfExpired`) keeps the conversation
  (`retainConversation`), parks the worktree (`parkSessionWorktree`, async),
  closes open asks (`closeAsks`, so a later press is a late press), then
  drops the maps and the row; it never purges a session with a run in flight
  (`activeRuns`). `endSession` does the same minus `closeAsks`.
- The bridge's chat path enqueues on the routed session's `SessionRunControl`
  queue before anything else; a waited turn re-checks
  `waitedMessageStillAllowed`. A message routed to a session that has ended
  by its turn is dropped silently, so ending the open session while messages
  still route to it would lose them.
- `getByUserChannel` picks the newest `lastActivityAt`; a run's end touches
  its session, so an old session can look newer than a fresh one created
  while its run went.
- `resume` on `AgentRunChatOpts` is informational (the spawn client
  ignores it); continuity is the bridge's replayed thread.
