---
change: saying-new-topic-starts-a-fresh-session-a-normal-mention-keeps-continuing-the-open-one-session-3-b
artifact: design
---

# Design

- **The phrase** (`src/discord/new-topic.ts`). `newTopicRequest(prompt)`
  works on the routed prompt (`stripMentions`, so the bot mention is gone
  and whitespace collapsed): it sets the IDENTITY-5 trailer aside, matches
  `^new\s+topic` (any case) followed by the end (optionally `.` / `!`),
  one `:` / `-` / `–` / `—` / `,`, or whitespace, and returns the rest
  with the trailer (`""` when nothing follows, null otherwise). "new
  topics", "new topic's", "renew topic" and the phrase later in the text are
  not it. No other wording, no model call.
- **Routing.** `newTopicRoute` runs where `routeMessage` would return
  `continue_session` (thread own session, reply to own answer, a live
  session carrying a retained record) or start a session by @mention, always
  after the channel, actor and mute / rate gates of that path. On the
  SESSION-3.a seeded path it starts fresh instead of replaying the record.
  It creates the fresh session synchronously (like `start_session`) and calls
  `store.supersede(open)`, so the author's next message in that place finds
  the fresh session (`getByUserChannel` skips superseded sessions; the
  thread map already points at the fresh one) and queues behind this one —
  nothing they send after 'new topic' can land on the old session and be
  dropped when it is parked.
- **Bridge.** The `new_topic` action carries `session` (fresh) and
  `prompt`, so it rides the normal chat path: it takes the fresh session's
  turn first, then (with `open`) enqueues on the open session's queue and
  waits for its run like any message (AGENT-3.a; a waited one is tracked in
  flight, REQ-discord-311). After a wait it re-checks
  `waitedMessageStillAllowed` and `requesterForgotten`; failing, nothing is
  parked, run or posted. Then `store.endForNewTopic(open)` and the open
  turn is released. While it waits, the bridge remembers (fresh id → open id
  and its own wait turn), so a `stop` / `cancel` the author says — which now
  routes to the fresh session — stops the open session's run rather than the
  queued request (once that run is over, it stops the queued request). An empty request posts `NEW_TOPIC_ACK` (fixed text, no
  hold, no pings) tracked to the fresh session and returns; otherwise the
  run goes on as a start (`resume: false`, empty thread), with roles,
  SAFE-12/13, memory, identity and the Stop button as for any run; a SAFE-13
  refusal drops the fresh session (`action.kind !== "continue_session"`).
- **Waiting (review fixes).** While it waits, the fresh session is held
  busy with `SessionStore.runActive` (no agent run), so an open run longer
  than the soft TTL cannot get it purged as idle — which would drop the
  messages queued behind it and run the request on a dead session — and the
  wait's end counts as its activity; after the wait the fresh session must
  still be live. A message of the open session's own that came in while it
  waited (a reply to one of its answers, a pick) is queued behind the new
  topic on that session; parking then would drop it silently, so the park is
  skipped while `SessionRunControl.waitingBehind(openTurn)` is true: the
  message runs there as before, and the superseded session idles out.
- **Parking.** `SessionStore.retire` is idle expiry's body (retain
  conversation, park worktree, close asks, drop maps and row), now shared by
  `purgeIfExpired` (unchanged behaviour) and `endForNewTopic`, which refuses
  a session that is not live or has a run in flight.
- **Alternatives rejected.** Replying "a run is going, say it again later"
  (AGENT-3.a says a message waits); parking in the router (a run may be in
  flight, and the worktree park is async); creating the fresh session only
  after the wait (later messages would route to the old session and be
  dropped when it is parked); carrying the old session's project or summary
  into the fresh one (a fresh session replays nothing and starts in the
  default project, like a new @mention).
