---
module: discord
artifact: testing
---

# testing

See discord.spec.md, docs/DISCORD-GO-LIVE.md, and SpecSync change artifacts for HEAR #5.

- DISCORD-3: thinking-status builders + bridge progress edit sequence (no live token).

## Slash commands (DISCORD-4)

- `tests/discord.slash.test.ts` covers command bodies, dispatch gates, and
  session/status/agents/work handlers with fixture interactions (no live token).
- `tests/discord.register-commands.test.ts` covers guild PUT then clear-globals
  put order (REQ-discord-016; injectable put; no live token).

## Rate limits + mutes (DISCORD-6)

- `tests/discord.rate-mute.test.ts` covers checkRateLimit, mute/unmute,
  router + slash per-user independence (no live token).

## Admin re-auth + confused-deputy (DISCORD-7 / 8)

- `tests/discord.admin-reauth.test.ts` — resolvePermissionLevel + mute/unmute
  minPermission re-check (no live token).
- `tests/discord.requester-perms.test.ts` — evaluateRequesterCanSend + post
  plugin requester/strict gates (no live token).

## Image attachments + protocol lockstep (DISCORD-9 / 10)

- `tests/discord.image-attachments.test.ts` — MIME allowlist, size/count caps,
  base64 blocks, localPath write, enrichPromptWithImages (no live token).
- `tests/discord.protocol-version.test.ts` — Merlin-shaped handshake match /
  mismatch / unverifiable / timeout (stub binaries; no live token).


## Presence version (DISCORD-12)

- `tests/discord.presence.test.ts` — `formatPresenceVersionString` +
  `buildVersionPresenceActivity` Custom type/state from shared VERSION
  (no live token).

REQ-discord-019: `tests/discord.session-store.durable.test.ts` + `tests/store.*.test.ts` cover SQLite persist/reload and soft TTL without live Discord.
- MemoryStore CRUD/ACL/reload fixtures (REQ-discord-021 / MEMORY-1..4 / MEMORY-ACL-1..5).
- REQ-discord-022: `tests/worktree.test.ts` + `tests/discord.session-worktree.test.ts` cover isolation, park/cleanup, explicit project, schedule project scope.

## MEMORY Discord auto-recall inject (REQ-discord-023)

- `tests/discord.memory-inject.test.ts` — format/enrich empty+seeded scope, system prompt rules, richer memory tool argv (no live Discord).
- DISCORD-ASK-6/7: collapse thinking→stub→answer (ask-ephemeral + thinking-bridge + finalizeContent unit tests).

## Interrupted replies after a restart (REQ-discord-311, DISCORD-3 / AGENT-3)

- `tests/discord.inflight-replies.test.ts` — schema v9 table + v8→v9
  migration; `InflightReplyStore` lifecycle across a reopen; the bridge keeps a
  row (with the progress embed id) while the agent runs and clears it on
  success, failed exit, ask, thrown error and worktree refusal, for a message
  (thread rows keep the parent channel) and for a button pick's resumed run;
  a crashed bridge's frozen embed is edited to the red interrupted status by
  the next start; a failed edit or missing embed id falls back to a reply to
  the request message; a channel no longer allowlisted gets nothing; edit and
  reply both throwing still starts and deletes the row; no rows → nothing
  posted; recovery is sequential (no live Discord). With `editMessage`
  (DISCORD-ASK-6/7) the row is still present while the progress message is
  edited into the answer / Choose stub and gone after (mention success, failed
  exit, button ask, button pick reusing the stub); a refused collapse posts the
  fallback reply with the row present, then deletes it; a throwing collapse
  and the dry path (no reply surface) also delete it; a reply collapsed before
  a restart leaves nothing to recover, and a crash mid button pick marks the
  reused Choose stub interrupted.

## Collapsed answers still notify (REQ-discord-215, AUTONOMY-2/4, SAFE-8 x DISCORD-ASK-6/7)

- `tests/discord.collapsed-ping.test.ts` — `formatCollapsedPing` pointers,
  dedupe and `alreadyPinged`; with an editable thinking message a clarify ask
  (free text or Choose stub) is followed by one fresh requester-only ping
  replying to the edited answer (a reply to it continues the session), a stuck
  ask by one owner-only ping, a clarify ask with a pending 80% warning by one
  post pinging both; a spend-cap stop pings the owner once per episode; an
  answer with no mention, a fallback reply and a failed ping post add nothing;
  a button pick that gets stuck pings the owner; `/work` clarify pings the
  requester after the collapsed answer; the #160 owner notice is the only
  owner ping (`/work` at the cap, owner-as-requester clarify); a notice that
  had to ride the collapsed answer is followed by one owner ping; the slash
  fallback adds no post. Allowed mentions equal exactly the mentioned users
  (no mass or role mentions, no components, one line).
- `tests/discord.spend.test.ts`, `tests/discord.ask-ping.test.ts`,
  `tests/discord.ask-ephemeral.test.ts`, `tests/discord.thin-ack.test.ts`,
  `tests/discord.inflight-replies.test.ts` — collapsed answers that mention
  someone now expect the one ping post (was: no fresh post at all).
## Slash-started asks stay pending (REQ-discord-044, AUTONOMY-1/5/6)

- `tests/discord.slash-pending-ask.test.ts` — `/work` and `/session start`
  runs that stop to ask keep a free-text pending ask (options dropped; never a
  spend-cap stop) and `/work` records the task `blocked`; the collapsed slash
  answer maps to its session, so a reply `ok` restates without running the
  agent, `cancel` clears with the short ack, and a substantive reply resumes
  the same session with the question as context; a stuck `/work` ask pings
  the owner once (the notice post) and a thin reply restates to the owner
  only; another user's reply neither runs the agent nor touches the ask; a
  finished run keeps no pending ask; without `editMessage` an @mention `ok`
  still restates (no live Discord).

## Discord user lookup (REQ-discord-312 / REQ-plugins-312)
`tests/discord.user-lookup.test.ts` covers guild gate, dry-run, mocked REST.

## Schedule runs never stuck (REQ-discord-346)

- `tests/scheduler.never-stuck.test.ts` — a `markRunFinished` that throws
  once is retried (row `completed`, one `ok: true` event, "retrying once"
  logged); one that throws twice logs `[scheduler] run failed: could not
  record run …` and reports the run failed; bridge `stop()` with a real spawn
  client and a fake `sh` agent records the in-flight run `failed`
  (`interrupted: bridge shutdown`), kills the agent and removes its worktree
  and branch; bridge start after a `kill -9` of a child process that was
  running a schedule run fails it (`interrupted: process restarted`) and
  removes its worktree, while a live child's run, worktree and branch stay;
  a bridge started inside a schedule-run worktree whose run another data dir
  owns leaves that worktree, its uncommitted file and its branch alone;
  a claimed run records `<pid>:<proc start>` and a v9 DB migrates to v10 with
  its old `running` row recovered. Temp git repos and SQLite files, no live
  Discord.

## Schedule asks reach Discord from daemon runs (REQ-discord-347, AUTONOMY-2 / AUTONOMOUS-7)

- `tests/scheduler.ask-outbox.test.ts` — a daemon-wired scheduler (no owner,
  no outbound) and a bridge-wired one on one in-memory DB: a daemon stuck run
  stores `ask_reason`/`ask_question` with `ask_posted_at` null and posts
  nothing; the bridge's next tick posts it once (prefix, stuck headline,
  question, owner mention) and remembers the ping key; clarify mentions only
  the schedule creator; spend-cap pings the owner once per episode with the
  pending 80% warning and no reply hint; the same question pings once and
  only the newest of two pending asks posts; a later finished run or a
  deleted schedule leaves nothing; a refused channel posts nothing; a creator
  the live allowlist no longer lists (or deny-lists) gets no post until the
  shared allowlist lets them back, then one post with the ping; a post
  that resolves `false` or throws is retried with its ping; a run the bridge
  posted itself is never posted again and two bridge tickers post a pending
  ask once; a v10 DB migrates to v11; the question is scrubbed at rest and
  re-scrubbed by `rescrubDatabase`; a later run that finishes while a pass
  is posting another schedule's ask makes that ask moot; after `stop()` a
  pass finishes its post in flight and takes no other ask, and
  `settleAskDelivery(ms)` is bounded; `startDaemon` logs `run.needs_human`
  and a `startBridge` on the same data dir posts the ask to the owner once;
  the bridge's stop closes the gateway only after a pending-ask post in
  flight resolved. No live Discord.

## Schedule auto-pause and pre-run failures ask the owner (REQ-discord-353, AUTONOMY-2)

- `tests/scheduler.ask-outbox.test.ts` — daemon + bridge on one in-memory DB:
  the run that makes 5 failures in a row pauses the schedule and stores the
  stuck `autoPauseAsk` (earlier failures store none); the bridge's next tick
  posts it once with the owner ping; a stuck 5th run posts the pause line
  plus `Last failure: <question>`; a bridge-claimed 5th failure posts the
  pause ask with the ping instead of the `❌` line; creator-refused runs
  that auto-pause post nothing until the creator is allowed again. With
  worktrees on: a daemon run whose project cannot be resolved stores the
  fixed `PROJECT_RESOLVE_FAILED_QUESTION` (full error with the host path
  on the row only) and the bridge pings the owner once per question; a
  bridge run whose worktree cannot be created (a `talk` branch blocks
  `talk/<run>`) posts `WORKTREE_FAILED_QUESTION` at once with the ping,
  once, without the host path.
- `tests/scheduler.service.test.ts` — `markRunFinished` stores the pause ask
  when the SQL failure count reaches 5 even from a stale cache; a success
  stores none.

## Schedule ticks gate the creator (REQ-discord-020, DISCORD-SCHEDULE-3)

- `tests/scheduler.actor-gate.test.ts` — a deny-listed creator's due schedule
  is refused at tick (no agent run, no post, `creator not allowlisted: …`,
  one consecutive failure); with a non-empty user list an unlisted creator is
  refused while a listed user and the configured owner (not on the list) run
  and post; a deny-listed owner is refused; a creator deny-listed while the
  run is in flight gets no post; refused ticks auto-pause the schedule after
  5; empty user and role lists still run any creator. In-memory store,
  injected agent, no live Discord.

## Slash answer reply continuity (REQ-discord-002, DISCORD-2 / SESSION-MULTI-1)

- `tests/discord.slash-reply-continuity.test.ts` — through `startBridge` with a
  fake gateway: after `/session start` (or `/work`) A then B, the owner's reply
  to A's answer resumes session A with the reply ping on and off; a fallback
  answer (no collapse, deferred reply id from `editReply`) is tracked too;
  a member's `/work` A/B works the same, and another user's reply (even the
  configured owner's) never resumes A; a throwing tracking write still lets
  the answer collapse and the deferred reply be deleted (no live Discord).

## Session thread replay (REQ-discord-072, AGENT-6 / SESSION-3 / SESSION-MULTI-1 / SAFE-4 / SAFE-6)

- `tests/discord.session-thread.test.ts` — through `startBridge` with a fake
  gateway and a recording agent: a reply, the same user's @mention and
  further replies carry every earlier turn oldest first before the new
  message (`humanText` the new message only); a second bridge on the same DB
  file continues the thread; replies to `/session start` and `/work` answers
  carry the topic/description and answer; a button pick carries the original
  request; a spend-cap stop keeps the request but no cap text; the request is
  stored as its run starts (a restart mid-run finds it) and a run that
  throws (chat, `/session start`, `/work`) keeps it for the next message; `planningSelectionText` of a continued prompt is the new message
  only (REQ-agent-004); replayed and stored turns are scrubbed. Guards: idle past the TTL starts fresh with no
  replay; another user's session never sees my turns; confirm tokens only
  from the current message (no live Discord).
- `tests/discord.session-thread.unit.test.ts` — the renderer (budget,
  opening request + newest turns, exact omitted count, per-turn clip that
  never cuts a surrogate pair, one paragraph that Planning selection skips,
  `answerTurnText`) and `SessionStore` turns (module-owned table without a
  schema version change, reload after reopen, delete on end/TTL, orphan
  sweep, turn cap, scrub on write, `SCRUB_TARGETS` + `rescrubDatabase`).
## Attached images reach the model (REQ-discord-013 modified, DISCORD-9)

- `tests/discord.image-attachments.test.ts` bridge e2e now downloads a real
  PNG: `files-read` on the prompt's cited path returns `mediaType`
  `image/png` and `result.image` base64 equal to the downloaded bytes (not a
  UTF-8 decode). The tool-loop half is in `tests/agent.tool-loop.test.ts`
  (REQ-agent-428).
