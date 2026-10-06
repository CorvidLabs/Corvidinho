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
- Same file: in a bridge-started run (`CORVIDINHO_ACTING_DISCORD_USER_ID`
  set) the post checks the acting user without `--requesting-user-id`, refuses
  a requesting id naming another user (either alias, also a second id beside
  the acting user's), meets strict mode with the acting
  user's check, and refuses with one scrubbed line when the check cannot run
  (a throwing checker; the real discord.js `login` stubbed to fail as with
  Server Members Intent off); a `fetch` spy proves nothing is posted. With the
  acting env empty or unset the flag / strict behaviour is unchanged
  (REQ-discord-012, no token, no network).
- Same file, live path with no injected checker: `Client.prototype.login` is
  stubbed to emit `ready` on a fake guild text channel, so
  `verifyRequesterCanSend` runs its own `permissionsFor(member).has` check —
  no View Channel + Send Messages → 403, both → ok, not in guild → 403,
  missing / non-text channel → 404, a file post without Attach Files → 403;
  `discord-post-message` in a bridge run posts nothing on a live denial and
  once when allowed (REQ-discord-012 / REQ-discord-476).
- `tests/discord.allowed-mentions.test.ts` — REQ-discord-205: fake discord.js
  injected into the live gateway; chat mention/reply-continue, `/session
  start`, `/work`, slash, embeds, schedule tick and `discord-post-message`
  (stubbed fetch) all send `parse: []`; ask keeps owner-only (no live token).
- `tests/discord.post.plugin.test.ts` — REQ-discord-004 / REQ-plugins-009:
  with no allowlist file, `CORVIDINHO_DISCORD_ALLOW_CHANNELS` unset and
  `DISCORD_CHANNEL_IDS=111`, a dry-run `discord-post-message` to `111` posts
  and one to `222` is refused (not allowlisted);
  `CORVIDINHO_DISCORD_DENY_CHANNELS=111` on top refuses `111` with exit 3.
- `tests/discord.send-file.test.ts` — REQ-discord-004 / REQ-discord-476: with
  no allowlist file and the conversation channel only in `DISCORD_CHANNEL_IDS`,
  `discord-send-file` attaches there and in a thread under it; a channel in no
  list is refused (not allowlisted) and a deny on the channel refuses.

## Image attachments + protocol lockstep (DISCORD-9 / 10)

- `tests/discord.image-attachments.test.ts` — MIME allowlist, size/count caps,
  base64 blocks, localPath write, enrichPromptWithImages (no live token).
- `tests/discord.protocol-version.test.ts` — Merlin-shaped handshake match /
  mismatch / unverifiable / timeout (stub binaries; no live token).


## Presence version (DISCORD-12)

- `tests/discord.presence.test.ts` — `formatPresenceVersionString` +
  `buildVersionPresenceActivity` / `buildVersionPresenceData` Custom
  type/state from shared VERSION (no live token).
- Same file: `createLiveGateway` runs the real discord.js `login` with only
  the socket connect stubbed; the IDENTIFY presence it builds
  (`options.ws.presence`, sent as `d.presence` on every IDENTIFY) carries the
  version Custom Status, ClientReady still calls `setPresence` with the same
  data, and a throwing `setPresence` does not stop the ready path
  (REQ-discord-017, no token, no network).
- Same file: `verifyRequesterCanSend` (DISCORD-8 requester check) runs the
  real discord.js `login` with the socket connect stubbed to fail; its
  IDENTIFY presence carries the same version Custom Status, and the client is
  destroyed (REQ-discord-017, no token, no network).

REQ-discord-019: `tests/discord.session-store.durable.test.ts` + `tests/store.*.test.ts` cover SQLite persist/reload and soft TTL without live Discord.
- MemoryStore CRUD/ACL/reload fixtures (REQ-discord-021 / MEMORY-1..4 / MEMORY-ACL-1..5).
- REQ-discord-022: `tests/worktree.test.ts` + `tests/discord.session-worktree.test.ts` cover isolation, park/cleanup, explicit project, schedule project scope.

## Thread sessions per user (REQ-discord-046 / REQ-discord-002, DISCORD-2.a / SESSION-MULTI-1/2)

- `tests/discord.thread-sessions-per-user.test.ts` — `routeMessage` +
  `SessionStore` (no live Discord): user A starts and continues in a thread,
  user B @mentions there and gets their own session, and A's next plain
  message still continues A's (B's continues B's); the same while A has an
  open button ask (id and expiry unchanged), after B's session ends, and after
  a SQLite reload; a user with no session there is ignored on a plain message
  and starts their own on @mention; `getByThread` with and without a user.

## MEMORY Discord auto-recall inject (REQ-discord-023)

- `tests/discord.memory-inject.test.ts` — format/enrich empty+seeded scope, system prompt rules, richer memory tool argv (no live Discord).
- DISCORD-ASK-6/7: collapse thinking→stub→answer (ask-ephemeral + thinking-bridge + finalizeContent unit tests).
- DISCORD-3.a answer footer (REQ-discord-457): `tests/discord.thinking-status.test.ts`
  (`finalizeContent` keeps a footer-only embed `model | plumbing` with no
  description, error color when failed, kept on a re-edit; none on a Choose
  stub or with nothing to show), `tests/discord.thinking-bridge.test.ts`
  (mention answer and a button pick's resumed answer carry it, the Choose stub
  does not, the body has no plumbing), `tests/discord.slash-ask7.test.ts`
  (`/session start` and `/work`); collapse assertions in ask-ping, spend and
  inflight-replies tests expect the footer-only embed (no live Discord).
- DISCORD-15/15.a/16 rich replies (REQ-discord-075, REQ-discord-457):
  `tests/discord.rich-reply.unit.test.ts` (fence-safe split, moved and
  reopened blocks, closed open fence, space / surrogate-safe cuts, role note in
  the last part, scrub before split, embed only for long plain prose, fresh
  part mentions (a mention past the first part pings there once), the
  whole-answer cap, tokens / cost unknown never $0, owner-only spend in the
  footer) and `tests/discord.rich-replies.test.ts` (bridge chat, fallback
  reply, button-pick resume, `/work`, `/session start` split with the footer on
  the last part; a split fallback reply pings the owner on the part holding
  the SAFE-8 warning line, once; a SAFE-13 injection line keeps the whole
  split answer, pings the owner once on the part holding it (fallback) or by
  one ping post (collapsed), with the role note whole in the last part;
  owner vs non-owner footer and live token use; a free-text ask's Answer
  button keeps the footer collapsed and on the fallback reply; Discord spawn
  client passes the whole answer and `usage`, WATCH keeps 1800; live gateway
  sends 2000 characters with the embed). Footer assertions elsewhere expect the
  time segment (`model | Ns`).

## Button-pick resume identity (REQ-discord-446, IDENTITY-4)

- `tests/discord.identity-pick.test.ts` — through `startBridge` with a fake
  gateway and a recording agent: a non-owner's pick resume carries
  `display_name` from the press's Discord display name, or its username when
  there is none; the owner's pick keeps the owner map display and role line;
  a pick with no names known injects the id only. `componentActorNames` maps
  member display → nickname → global name → user display and the username,
  trimmed, blank as undefined. A button press emitted on the live gateway's
  client (real `login`, socket connect stubbed) reaches `onComponent` with the
  presser's names, or neither when none is known (no live Discord).

## Deny wins over an allowlisted parent (REQ-discord-212 / REQ-discord-311 / REQ-discord-476, DISCORD-5)

- `tests/discord.thread-deny.test.ts` — `channels = [parent]`,
  `deny_channels = [thread]`: `routeMessage` refuses the @mention silently and
  ignores a plain message in the thread; a session started there before the
  deny is not continued by a thread message, a reply to its bot message or a
  mention; a deny on the parent wins over an allowlisted thread; the parent and
  its other threads are still served. `componentChannelAllowlisted` is false
  for a press in the denied thread, for a session in it pressed from the
  parent, and for a session under a denied parent. Through `startBridge` (fake
  gateway, dry run): the owner's @mention there runs no agent and posts
  nothing; a talk in the thread stops once it is deny-listed; an ask button
  there gets only the zero-width ack (the tip for an admin) and stays pending.
  A slash command there gets only the zero-width ack (the tip for the owner),
  `/schedule create` naming it is refused, and a schedule whose channel is the
  thread neither runs nor posts at tick (both already gated the thread id;
  kept as regression locks), and `discord-post-message` to it is refused
  (`is denied`). Restart recovery edits and replies nothing for a row in the
  denied thread or under a denied parent and deletes the row, and still
  recovers a row in another thread under the parent.
- `tests/discord.thread-deny.test.ts` — where a deny on the parent alone
  reaches a thread allowlisted by its own id (`channels = [thread]` or
  `[parent, thread]`, `deny_channels = [parent]`), pinning current behaviour
  (REQ-discord-212): a message in the thread is refused silently and runs
  nothing through `startBridge`, both a new @mention and a thread message,
  reply or mention in a talk started there before the deny; an ask press for
  a session a message started there is not allowlisted, and through
  `startBridge` gets only the zero-width ack with no resume. Slash,
  `/schedule` and `discord-post-message` gate the id they are given:
  `/status` in the thread is served, `/schedule create` naming it is accepted
  and a tick on it runs and posts there, and
  `discord-post-message --channel <thread>` posts (dry run). A
  `/session start` session in the thread (no thread id recorded) is judged on
  the thread alone: its ask press resumes it with `replyChannelId` = the
  thread and no `replyParentChannelId`, its pick's restart row records no
  parent, and a restart row with no parent is recovered in the thread; a
  reply in the thread to its answer is a message run that carries the parent
  as `replyParentChannelId` and on its restart row (REQ-discord-311 /
  REQ-discord-476).
- `tests/discord.send-file.test.ts` — a deny-listed thread under its
  allowlisted parent is refused `is denied` before any requester check or
  upload; another thread under that parent still attaches.
- `tests/discord.send-file.test.ts` — REQ-discord-212 / REQ-discord-476: a
  thread allowlisted by its own id, its parent not listed, attaches in the
  thread after the acting user's check (as the router serves it); with the
  parent deny-listed it is refused (`is denied`), a deny-listed thread under
  an allowlisted parent is refused, and a thread whose parent is not listed
  either is refused (not allowlisted); nothing more is checked or uploaded.
  Fails against the plugin before this fix (it gated the parent only).

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
  requester-only ping (the warning goes to the owner by DM, SAFE-14.a); a
  spend-cap stop pings the owner once per episode; an
  answer with no mention, a fallback reply and a failed ping post add nothing;
  a button pick that gets stuck pings the owner; `/work` clarify pings the
  requester after the collapsed answer; the #160 owner notice is the only
  owner ping at the cap (`/work`, without the warning, which is DMed); an
  owner-as-requester clarify with a pending warning gets only the question's
  ping (no owner notice; the warning is DMed); a notice that
  had to ride the collapsed answer is followed by one owner ping; the slash
  fallback adds no post. Allowed mentions equal exactly the mentioned users
  (no mass or role mentions, no components, one line).
- `tests/discord.spend.test.ts`, `tests/discord.ask-ping.test.ts`,
  `tests/discord.ask-ephemeral.test.ts`, `tests/discord.thin-ack.test.ts`,
  `tests/discord.inflight-replies.test.ts` — collapsed answers that mention
  someone now expect the one ping post (was: no fresh post at all).
## Open button asks keyed by askId (REQ-discord-044, SESSION-MULTI-3 / DISCORD-ASK-3/5)

- `tests/discord.ask-ephemeral.test.ts` — while a Choose ask is open, a later
  chat run that asks again (buttons or free text) keeps the earlier ask: its
  Choose button opens its choices and a pick resumes with that question and
  label while the newer ask stays pending; a thin reply restates the newest;
  a free-text answer clears only that ask; a late press on the earlier ask
  expires only it; a timed-out earlier ask is dropped, not promoted, when the
  newest is picked (a thin reply then runs the agent); `cancel` clears every
  open ask; `SessionStore` keeps open
  asks by askId in `discord_sessions.pending_ask` (one object, or an array
  when several are open) across a reopen (no live Discord).

## A late press on an ask that is no longer open (REQ-discord-045, DISCORD-ASK-5/8)

- `tests/discord.ask-ephemeral.test.ts` — the requester's Choose and option
  press on an earlier ask dropped (timed out) at the newest pick, and on both
  open asks of a session idle past its TTL, get exactly the ephemeral
  `ASK_CHOICE_EXPIRED` with no run, no session and nothing posted; another
  user's press on them (and on the live ask before the purge) gets the
  not-for-you reply; a still-stored expired ask is cleared by the first press
  and a second press is still expired; a re-press after a pick and a press
  after `cancel` keep the not-for-you reply before and after the purge;
  in a talk inside a thread under the allowlisted channel, the requester's
  press in that thread on a dropped ask and on a TTL-purged session's ask get
  `ASK_CHOICE_EXPIRED`, another thread or a non-allowlisted channel (or the
  talk's channel leaving the allowlist) gets the zero-width ack;
  `SessionStore.findClosedAsk` holds only askId, user, expiry and the talk's
  channel and thread for a drop, a late clear, a runtime purge and a load
  purge (never a pick, a cancel or a re-stored askId) and forgets the oldest
  past `CLOSED_ASKS_MAX`.
- `tests/discord.ask-button-gates.test.ts` — a muted or deny-listed
  requester's press on an ask of a TTL-purged session gets `MUTED` / the
  zero-width ack; once let through it gets `ASK_CHOICE_EXPIRED`, no run.

## Slash-started asks stay pending (REQ-discord-044, AUTONOMY-1/5/6)

- `tests/discord.slash-pending-ask.test.ts` — `/work` and `/session start`
  runs that stop with an ask whose options cannot be listed (none, or a single
  option) keep a free-text pending ask (never a spend-cap stop) and `/work`
  records the task `blocked`; the collapsed slash
  answer maps to its session, so a reply `ok` restates without running the
  agent, `cancel` clears with the short ack, and a substantive reply resumes
  the same session with the question as context; a stuck `/work` ask pings
  the owner once (the notice post) and a thin reply restates to the owner
  only; another user's reply neither runs the agent nor touches the ask; a
  finished run keeps no pending ask; without `editMessage` an @mention `ok`
  still restates (no live Discord).
- `tests/discord.slash-choose-ask.test.ts` (DISCORD-ASK-1/4) — `buttonAskFor`
  lists structured options or a numbered list and returns null for free-form
  questions and spend-cap stops; a `/work` clarify ask with options answers
  with the collapsed Choose stub (no question, options or reply hint in it;
  one Choose button; the requester's fresh ping) and keeps the ask with its
  options and `stubMessageId`; the requester's Choose press opens the
  ephemeral question with option buttons and a pick resumes the same session
  (`resume: true`, chosen label) with the answer edited into the stub;
  `/session start` with a numbered list does the same; a thin reply restates
  the stub with its button and a substantive reply continues without clearing
  the button ask; a stuck `/work` ask with options is `failed`, its stub pings
  nobody and the owner notice is the one fresh post; when that notice post
  fails the re-edited stub keeps its Choose button; without `editMessage` the
  deferred reply carries the stub and button and its id is `stubMessageId`;
  without listable options the answer stays free text with no Choose button
  but one Answer button, the Answer hint and its `stubMessageId`
  (REQ-discord-548);
  `recordSlashStub` records the stub id only on a still-pending ask of a live
  session (not after a pick took it, not after the session ended); the live
  gateway adapter forwards the Choose button on `editReply` and `reply`. The
  bridge-level tests fail on the base sources (free-text answer, options
  dropped).

## Free-text asks answered privately (REQ-discord-548, DISCORD-ASK-4.a)

- `tests/discord.ask-answer-modal.test.ts` (bridge harness: fake gateway,
  injected agent, memory outbound, no token) — the free-text stub quotes the
  question, carries `ASK_ANSWER_HINT`, exactly one Answer button and its
  footer embed, and is the ask's `stubMessageId`; a spend-cap stop has no
  button and no pending ask; `answerAskFor` is null for listable options and
  spend-cap, drops a lone option; `formatAskReply` swaps the hint. The
  requester's press opens `buildAnswerModal` (type 18 label, type 4 paragraph
  input, `ASK_ANSWER_MAX` ≤ 4000, short title, scrubbed ≤100-char question
  description) with no post and no run; another user's press gets
  not-for-you. The submit resumes the same session (`resume: true`) with the
  reply's prior-question block, `humanText` the trimmed answer, ephemeral
  `ASK_ANSWER_ACK` then deleted, the stub thin-updated (its Answer button
  replaced by the run's Stop button, REQ-discord-303) and edited into the
  answer (the Stop button cleared), the typed text never posted, the thread turn recorded, the ask
  cleared, a second submit a no-op; the text is scrubbed before the run and
  the thread; `normalizeAskAnswer` cuts and trims; a thin or blank submit
  (`ok`, whitespace, emoji, `sure!`) is restated privately with the Answer
  button, no run, ask kept, nothing in the thread, and a real submit then
  resumes (AUTONOMY-5); a `never mind` / `cancel` submit gets only the
  ephemeral `ASK_CANCELLED_ACK`, runs nothing and clears the free-text ask and
  an earlier open Choose ask, after which the Answer button is already
  answered (AUTONOMY-6); a follow-up free-text ask gets its own Answer button
  in the same stub. Another user's, a muted (then unmuted: resumes), a deny-listed
  (user or role), an off-channel, a rate-limited and a late (past ~30 min)
  press or submit are refused ephemerally with no run and the ask kept; after
  a late one a thin reply restates without a button and a reply still
  answers with the prior-question block; a press/submit id mix-up is
  ignored; a submit on a Choose ask is refused. A reply answers the ask as
  before and the Answer button then says already answered; a thin reply
  restates with the live button. A `/work` free-text answer's Answer form
  resumes that session in the answer message. Gateway: `parseAskCustomId`
  reads `answer`; `adaptComponent.showModal` calls discord.js `showModal`;
  `adaptModalSubmit` maps text inputs, ephemeral flag 64 and no parsed
  mentions; a MODAL_SUBMIT interaction on the live client reaches
  `onComponent` with its text. `tests/discord.ask-ping.test.ts`,
  `tests/discord.thin-ack.test.ts`, `tests/discord.slash-pending-ask.test.ts`
  and `tests/discord.slash-choose-ask.test.ts` now expect the Answer button
  and hint on free-text asks. These fail on the base sources.
- The community requester's typed answer reaches the resumed run inside the
  untrusted-data fence (`role: community`, `source=ask-answer`) after the
  prior-question block, as a reply's words would (SAFE-12, REQ-discord-071);
  `humanText` and the thread turn stay the plain answer. The submit, thin,
  follow-up, muted and `/work` tests assert the fence and fail on the base
  bridge (answer unfenced). The SAFE-13 refusal of an injected submit is in
  `tests/safe.injection.test.ts` (below).

## Unique option ids and expired button asks (REQ-discord-044 / REQ-discord-045 / REQ-agent-045, DISCORD-ASK-1/3/5)

- `tests/discord.ask-ephemeral.test.ts` › "ask option ids and expired button
  asks (DISCORD-ASK-1/3/5)" — an ask whose options repeat one id opens with
  distinct pick `custom_id`s and a press on the second resumes with its own
  label; a thin reply after the only button ask timed out runs the agent
  and restates no Choose button; after the newest ask timed out a thin reply
  restates the earlier live ask; a substantive reply after expiry runs the
  agent and clears the ask; `cancel` after expiry keeps its short ack and
  runs nothing (no live Discord). No owner is configured there, so the
  presser is community and the pressed label reaches the run inside the
  untrusted-data fence (`source=ask-pick`, SAFE-12.a); that assertion fails
  on the base bridge (label unfenced).

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
  the schedule creator; spend-cap pings the owner once per episode, posts only
  the schedule line and "💸 Work is paused for budget." (no question, no
  warning, no reply hint) and hands the stored question to the owner's DM pass
  once per episode (SAFE-14.a), and once per run when its post keeps failing
  and is retried every tick (three failing ticks, one DM; the post then goes
  out with the ping); the same question pings once (the first cancelled,
  AUTONOMY-6.a) and only the newest, open ask posts; a cancelled ask, a
  later finished run or a deleted schedule leaves nothing; a refused channel posts nothing; a creator
  the live allowlist no longer lists (or deny-lists) gets no post until the
  shared allowlist lets them back, then one post with the ping; a post
  that resolves `false` or throws is retried with its ping; a run the bridge
  posted itself is never posted again and two bridge tickers post a pending
  ask once; a v10 DB migrates to v11; the question is scrubbed at rest and
  re-scrubbed by `rescrubDatabase`; an ask cancelled while a pass is
  posting another schedule's ask is not posted; after `stop()` a
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
  pause ask with the ping and the run's DISCORD-3.b failed line as context
  (`That didn't work.`, not the run's output) instead of the `❌` line; a pause ask whose in-process post
  resolves `false` or throws stays pending with no ping key and the next
  tick posts it once with the ping; a bridge run that throws and makes the
  5th failure posts the pause ask at once without the error text;
  creator-refused runs that auto-pause post nothing until the creator is
  allowed again. With
  worktrees on: a daemon run whose project cannot be resolved stores the
  fixed `PROJECT_RESOLVE_FAILED_QUESTION` (full error with the host path
  on the row only) and the bridge pings the owner once per question; a
  bridge run whose worktree cannot be created (a `talk` branch blocks
  `talk/<run>`) posts `WORKTREE_FAILED_QUESTION` at once with the ping,
  once, without the host path; so does one whose worktree step throws
  (`WORKTREE_BASE_DIR` under a regular file).
- `tests/scheduler.service.test.ts` — `markRunFinished` stores the pause ask
  when the SQL failure count reaches 5 even from a stale cache; a success
  stores none.
- `tests/scheduler.ask-outbox.test.ts` — a schedule on an absolute project
  names the project, never the host path: a daemon run whose absolute
  sibling project cannot be resolved keeps the full error with the path on
  the row and the first line of the bridge's stuck ask names `gone`, without
  the temp dir; on `/srv/host-only/acme/Widget` the
  `✅` and `❌` result posts, a bridge clarify and stuck ask and a
  daemon-claimed stuck ask all name `Widget` and never `/srv/host-only`,
  while the model's prompt keeps `on project: /srv/host-only/acme/Widget`.
  Against the base without the fix: both fail.

## Schedule ticks gate the creator (REQ-discord-020, DISCORD-SCHEDULE-3)

- `tests/scheduler.actor-gate.test.ts` — a deny-listed creator's due schedule
  is refused at tick (no agent run, no post, `creator not allowlisted: …`,
  one consecutive failure); with a non-empty user list an unlisted creator is
  refused while a listed user and the configured owner (not on the list) run
  and post; a deny-listed owner is refused; a creator deny-listed while the
  run is in flight gets no post; refused ticks auto-pause the schedule after
  5; empty user and role lists still run any creator. In-memory store,
  injected agent, no live Discord.

## Zero cron step never hangs /schedule create (REQ-discord-020, DISCORD-SCHEDULE-4)

- `tests/scheduler.cron.test.ts` — "cron step and range forms never hang":
  `*/0`, `0-59/0`, `0,*/0` and `/0` in the hour, day, month and weekday fields
  run in a child bun with a 10 s timeout; `validateAndResolveCadence` and
  `getNextCronDate` each throw `CadenceError` (`Invalid cron step in "…"`);
  `5/0` is refused in-process; `0-99999999999 * * * *` is refused by the
  5-minute rule, a range past 2^53 has no run date, and
  `0 0-99999999999/2 * * *` resolves to itself with the next run of
  `0 */2 * * *`; cadences with steps of 1 or more resolve as before.
- `tests/discord.schedule.test.ts` — the owner's `/schedule create` with
  `*/0 * * * *` and `0-59/0 * * * *` (child bun, 10 s timeout) gets the
  ephemeral CadenceError reply, creates nothing, and a following
  `/schedule list` still answers. No live Discord.

## /schedule delete audit (REQ-discord-020, SAFE-5)

- `tests/discord.schedule.test.ts` — "/schedule delete audit (SAFE-5)": with a
  DB-backed store holding one schedule and one run, the owner's delete appends
  `schedule-delete` `started` then `ok` rows (surface `discord:schedule`, args
  digest of the resolved id, no raw id), the reply names `#1 started · #2 ok`,
  the schedule and its run rows are gone and the chain verifies; a throwing
  trail, a keyed chain without the key, and no trail wired each reply
  `audit log unavailable (SAFE-5)` and keep the schedule and its runs; a
  non-ADMIN delete gets `not authorized` and appends `denied` (a refused pause
  appends nothing); a store delete that throws after the intent row appends
  `error`; an unknown id appends nothing; an `ok` row that cannot be written
  after the delete leaves the delete in place and the reply says
  `ok row not recorded (see bridge log)`; a non-ADMIN delete while the trail
  throws still gets only `not authorized` and deletes nothing. No live Discord.

## Schedule text is data (REQ-discord-713, SAFE-12/13)

`tests/scheduler.injection.test.ts` (slash dispatcher with an in-memory
context; `SchedulerService` with a memory store, a recording agent and no
worktrees; `startBridge` with a null gateway and a memory DB; an allowlist
file that declares one team member):

- `/schedule create` by a stranger (community) and by a declared team member
  with an injection prompt, and by a stranger with an injection name alone:
  nothing stored; one ephemeral refusal that never quotes the text; one post
  in the channel pinging only the owner ("a /schedule request here");
  one `injection-suspected` / `denied` row (actor the user, surface
  `discord:/schedule`). An ordinary stranger create: only the ephemeral
  `NOT_AUTHORIZED`, no post, no row. The owner's create with the same words
  is stored unscanned.
- Tick, benign stranger schedule: the prompt starts `Scheduled work on
  project: proj-a`, carries `role: community` and the name and prompt inside
  the fence (`source=schedule-prompt`), the name nowhere else; the run is not
  ADMIN; the result post is unchanged. A declared team member's schedule is
  fenced as `role: team`, and as `role: community` when the creator is muted.
  The owner's schedule (injection-like words included) keeps its old prompt,
  unfenced, stays active, no row.
- Tick, stored stranger injection prompt (and a team member's injection
  name): no agent run; the schedule paused; one ask post with the schedule
  title pinging only the owner ("I didn't run this schedule"), never the
  text (for the injected name, the title is `Schedule (<id>) on <project>`
  and the name appears nowhere in the post); one `denied` row (surface `scheduler:<id>`); a later tick posts
  nothing more. A ticker with no outbound (the daemon) leaves the ask pending
  on the run row and a bridge-like ticker posts it once. Through
  `startBridge` the row lands in the bridge's `audit_log` and the schedule is
  paused.

Fail-on-base: with `src/scheduler/service.ts`,
`src/discord/command-handlers/schedule.ts`, `src/discord/injection-guard.ts`
and `src/discord/bridge.ts` from `origin/main` (5aaf7f0), 9 of the 12 tests
fail; the ordinary-create, owner-create and owner-schedule guards pass on
both.

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
- `tests/discord.session-thread.unit.test.ts` — the renderer (32000-char
  block ceiling, opening request + newest turns, exact omitted count,
  per-turn clip by role — agent 1500, a 4000-char human turn whole, human
  past 8000 clipped — that never cuts a surrogate pair, one paragraph that
  Planning selection skips, `answerTurnText`) and `SessionStore` turns
  (module-owned table without a schema version change, reload after reopen,
  delete on end/TTL, orphan sweep, turn cap, scrub on write, `SCRUB_TARGETS`
  + `rescrubDatabase`).

## Condensed, kept and resumed conversations (REQ-discord-472, SESSION-5/6 / SESSION-3.a / AGENT-6.a)

- `tests/session.condense.test.ts` — the window (`CORVIDINHO_LLM_CONTEXT_TOKENS`,
  default 8192, invalid → default, below 1024 → 1024) and the 80% budget with
  its 32000-char ceiling; `condenseConversation` folds nothing under the
  budget, folds oldest first at it (reaching it counts), keeps the task, the
  latest instruction and the new message word for word, gives the summary
  way when only pinned turns are left, keeps and bounds an earlier summary,
  stays one `[Corvidinho …]` paragraph; `SessionStore.threadPrompt` replays
  everything under 80% and condenses at it, stores the scrubbed summary with
  the session and rewrites the turn rows, gives the same prompt after a
  restart (no folded turn), condenses further from the summary for a smaller
  window, and folds turns past the 200 cap into the summary. SAFE-12: a
  fenced turn folded into a point keeps its words between that fence's own
  markers, a summary over its cap leaves a fenced point out whole, and the
  block quotes fake block lines and turn labels and restores the end marker
  of a turn clipped inside its fence.
- `tests/store.conversation.test.ts` — the v12 → v13 forward-only migration
  (a v12 DB keeps its rows and its forget requests, re-run idempotent; a v11
  DB goes through v12 to v13); `ConversationStore` scrubs, keeps the
  opening turn plus the last 20 (rest folded), the newest 100 answer ids, and
  finds by id / session / thread + user / answer id; 30-day retention (an
  update restarts it, purged after); `deleteForPerson` / `forgetConversations`
  by Discord id, GitHub login (any case) and participant, nobody else's;
  re-scrub of `summary` and JSON `turns`; `SessionStore` keeps an idled-out or
  ended session's conversation (nothing when nothing was said) and
  `forgetConversations` clears the user's live threads and retained records;
  an approved forget-me's `forgetMemoryTargets` deletes the person's kept
  conversations (Discord ids, a declared person's GitHub logins,
  participation) with their memory and nobody else's, and the bridge's
  `forgetTurnsOfUsers` drops their live summary and records.
- `tests/discord.session-resume.test.ts` — through `startBridge` with a fake
  gateway: after the soft TTL a reply to the answer starts a new session
  (new id, `resume: false`, `humanText` the new message) from the old
  conversation and a later reply to the old answer continues that session; a
  plain message in the thread does the same; a resumed conversation carries
  its summary; another user's reply / thread message gets nothing of mine; a
  muted or deny-listed user or a non-allowlisted channel gets no run; a
  session that idled out while the bridge was down resumes after the restart;
  a reply to an older answer after the resumed session idled out unnoticed
  starts from the resumed session's newest turns (the record keeps them); a
  talk on an explicit project resumes in that project and, once the project
  is gone, fails to bind instead of using the default project
  (SESSION-WORKTREE-4); after 30 days (purged, counted from the last
  activity even when the idle-out is noticed late) or once the person is
  forgotten the reply gets no answer; with `CORVIDINHO_LLM_CONTEXT_TOKENS=2048` in the bridge env a long
  chat's block stays under 80% with the task and latest instruction whole.
  Every bridge test here fails on the base sources (no retained conversation,
  no condensing); see the change's testing artifact for the fail-on-base run.
## Attached images reach the model (REQ-discord-013 modified, DISCORD-9)

- `tests/discord.image-attachments.test.ts` bridge e2e now downloads a real
  PNG: `files-read` on the prompt's cited path returns `mediaType`
  `image/png` and `result.image` base64 equal to the downloaded bytes (not a
  UTF-8 decode). The tool-loop half is in `tests/agent.tool-loop.test.ts`
  (REQ-agent-428).

## Open asks scrubbed at rest (REQ-discord-066 modified, SAFE-6)

- `tests/store.scrub.test.ts` › "open Discord asks persist scrubbed and are
  re-scrubbed as JSON (SAFE-6)": a button ask and a free-text ask with fake
  vendor keys in the question and an option label are stored redacted in the
  one-object and the array `pending_ask` row and reload with the same askId,
  option ids, expiresAt and stubMessageId; raw object and array rows saved
  under scrub rules version 2 (one with a private-key block that has no END
  line) are rewritten on the next open as valid JSON with ids byte-identical,
  still load as open asks, and a second open is a no-op; a value that is not
  JSON is scrubbed as text and counted, and the warning carries no stored text.
- Same file › "a secret-looking option id is swapped for its position when the
  ask is made, and scrubbed on write and on re-scrub": ask-human options whose
  ids are a GitHub token and an AWS key id get ids `1` and `2` (a clean id is
  kept); the saved row carries neither; an ask built without
  `normalizeAskOptions` stores the id redacted; an older row's secret-looking
  option id is redacted on the next open with askId, expiresAt and
  stubMessageId byte-identical.
- Scrub before cut (REQ-discord-066 modified, SAFE-6.a):
  `tests/discord.ask-scrub-first.test.ts` (bridge on temp SQLite, the ask as
  the spawn client parses it): a choice label whose fake key straddles the
  80-char cut is `…[redacted:github-token]…` on the Choose-pick buttons, in
  the stored `pending_ask` row and in the pick's human text; a free-text
  question straddling the 1500 cut is stored that way and nothing the Answer
  stub, its form or a restated ask posts carries a raw `ghp_` piece; after a
  restart the reloaded ask posts the same labels, and a stored label past the
  cut loads scrubbed before it is cut (ids unchanged).
  `tests/discord.ask-buttons.test.ts` › "SAFE-6.a: choice labels are scrubbed
  before they are cut or posted": `buildChoiceComponents` posts a whole or
  straddling key as `[redacted:<kind>]` (≤80, custom_ids unchanged).
  `tests/scheduler.ask-outbox.test.ts` › "SAFE-6.a: a question whose secret
  straddles the ASK_QUESTION_MAX cut…": `schedule_runs.ask_question` holds
  the marker for a daemon-claimed and a bridge-claimed run, and neither the
  run summary nor the posts carry a raw piece. All fail on the base sources.
- `tests/discord.send-file.test.ts` (REQ-discord-476, DISCORD-17): stubbed
  fetch (records the multipart `payload_json` and `files[0]`) and an injected
  requester checker, no live Discord. `discord-send-file` is dangerous,
  mutating, minTier 1, and its description says it can attach and never to
  say it can't; SAFE-1 denies it unlisted and ROLES-CHAT-3 refuses a
  non-owner run before any check; a PNG goes to the run's channel as
  `image/png` with its bytes unchanged, `allowed_mentions.parse = []` and the
  acting user checked with `{ attachFiles: true }`; a log is uploaded with a
  vendor key and the bot token's value redacted; the caption is defanged and
  scrubbed; `--channel` / `-c` / `--channel=` and a run with no conversation
  channel or acting user are refused; a channel off the allowlist is refused
  and a thread passes through its parent; `.env`, `.env.*`, `.git`, keystore,
  `.specsync` (also inside a change folder), `specs/`, `.ssh`,
  `fledge.toml`, a file under `.fledge/` and a link to it (SAFE-2.a; fails
  on main's `isProtectedPath`), a symlink to `.env`, a symlink into `.git`, a
  symlink out of the project and `..` / absolute outside paths are refused; `.sh`, a
  non-PNG `.png` and non-UTF-8 `.txt` are refused; a file over 8 MB is
  refused before the check, and so is a PNG whose size as first taken
  (`statSync` / `fstatSync` spied to report its size before it grew) is
  under 8 MB but whose bytes read are over it, after at most 8 MB + 1 byte
  is read (`readSync` / `readFileSync` spied to count; REQ-discord-476,
  fails against the plugin before the bounded read); a checked `notes.txt`
  swapped for a link to `.env`, or `logs/out.log` whose folder is swapped for
  a link into `.ssh`, at its first stat / open is refused (SAFE-2,
  REQ-discord-476; fails against the plugin that read with `readFileSync`);
  a 413 / code 40005 answer is reported; a check
  refusal (cannot attach) or a check that throws sends nothing; dry run
  uploads nothing; `started` + `ok` audit rows are written; `--git-diff`
  refuses an empty diff and attaches `changes.diff` with the tracked
  change, without the `.env.local` change and with the secret scrubbed. The
  spawn client writes the reply channel and parent env (empty when none,
  never inherited); through `startBridge` a channel mention, a thread
  mention (thread + parent), `/session start` and `/work` pass the
  conversation's channel, and an ask-button pick in a thread resumes with
  `replyChannelId` = the thread and `replyParentChannelId` = its parent. Against the base without the change: 20 of 21
  fail (the "no attach promise" guard passes).

## Nightly backup on the bridge tick (REQ-discord-680, OPS-1/2)

- `tests/ops.backup-wiring.test.ts` › "scheduler tick": `SchedulerService.tick`
  calls `backup.tick(now)` with its clock on every tick.
- Same file › "Discord bridge": `startBridge` with a file DB, a null gateway
  capturing replies, the owner set, `schedulerPollIntervalMs` 20 and
  `schedulerNow` 03:30 local. A backup dir that is a file and an announce
  channel: exactly one reply over many ticks, to the announce channel, starting
  `<@owner> ⚠️ The nightly backup failed`, `mentionUserIds` [owner], no host
  path; `ops_backup_notice` cleared, `ops_backup_failing_since` set. No announce
  channel: no reply at all and the notice stays pending. A good dir: tonight's
  snapshot written, no reply. A reply that never completes (`hang`): `stop()`
  waits the short grace and the notice is pending again for the next start.
- `tests/ops.backup.test.ts` › "nightly ticker" covers the delivery rules the
  bridge's `notify` relies on (hand back on a failed post, `owner_not_told`
  logged once, once per failure streak, notices recorded by a daemon ticker)
  and `settle(timeoutMs)` / `stop()` (a post outlasting the grace is handed
  back; a stopped ticker takes nothing more).
## Closing role note kept on the way to a post (REQ-discord-734, ROLES-CHAT-3)

- `tests/scheduler.service.test.ts` › "a long summary ending with the note
  keeps it in the run row and the post; one without is cut as before": a
  schedule with a 448-char name whose run returns the 1800-char
  `chatBodyFromTaskResult` of a summary ending with the note stores a
  1500-char run-row summary ending with the note and posts at most 1900 chars
  ending with it; a run returning 1800 plain chars stores and posts exactly its
  first 1500.
- `tests/discord.slash-ask7.test.ts` › "/work answer for a non-owner (team)
  keeps the closing role note in the rich answer": a declared team member's
  `/work` (community can't start one, IDENTITY-11.a) with a 207-char
  description (stub PR line) gets a collapsed answer of at most 1900 chars
  whose summary part is under 1500 (fitted after the head) and ends with the
  note.
- Same file › "/session start answer for a non-owner keeps the closing role
  note within the 1900 cap": the answer is at most 1900 chars, its summary part
  at most 1500, and it ends with the note.
- `tests/discord.spend.test.ts` › "the cut for an appended line keeps a
  closing role note": `appendPostLine` on an 1800-char body ending with the
  note and a ~210-char owner notice line gives a 1900-char post ending `y…`,
  the note, a blank line and the line; a body that fits is untouched. "a long
  post is cut so the appended line always fits" (no note) still ends
  `…\n\nLINE`.
- With `origin/main`'s `src/discord/ask-ping.ts`,
  `src/discord/command-handlers/work.ts`, `session.ts` and
  `src/scheduler/service.ts` swapped in, these four tests fail and every other
  test in their files passes; on the branch all pass.

## Declared people (REQ-discord-036, IDENTITY-13/14/6/7, ADMIN-3.a)

- `tests/identity.people.test.ts` — `[people.<id>]` TOML (plural + singular
  keys) and JSON parse; the allowlist loader and `[owner]` reader load the same
  file; unreadable entries skipped whole with id-free problems; `owner`
  reserved; `resolvePerson` by Discord id / `<@id>` / GitHub numeric id,
  never by GitHub login (IDENTITY-7.a), display or nickname, clashes match
  nobody;
  the owner's built-in or declared person with `role: owner`;
  `loadDeclaredPeople` re-reads the loaded file and never throws.
- `tests/discord.admin-people.test.ts` — `/admin people add|link|unlink|
  remove|list` through the slash dispatcher: file edits (TOML verbatim
  elsewhere, comments and unread keys kept; JSON entry only), live resolve
  after each change, SAFE-5 rows, no-change paths, refusals (clashing ids
  incl. the owner's GitHub login, bad ids, reserved id, unreadable entry, no
  or throwing audit trail), non-owner refused at dispatch and handler, the
  writer imported only by the admin handler, list under 2000 chars,
  `config show` count.
- `tests/identity.recognise.test.ts` — Discord identity block with people;
  through `startBridge`: chat, `/session start` and `/work` name the declared
  person; `/admin people` and a VM edit apply on the next message; a chat
  request to change links changes nothing (also the WATCH cases of
  REQ-watch-036).


## Roles on Discord surfaces and /admin people role (REQ-discord-065, IDENTITY-8..12, ADMIN-3.b)

`tests/roles.team.test.ts` — `resolveDiscordActingRole` (owner, team,
community; muted or deny-listed team ⇒ community); the spawn client stamps
`CORVIDINHO_ACTING_ROLE` owner / team / community and
`CORVIDINHO_ACTING_WORK_TASK`, never inherited from the bridge env
(schedules pass no role ⇒ community); through `startBridge` chat stamps each
speaker's role and a file edit applies to the next message; `/work` runs a
team member with `actingRole: "team"` + `workTask: true` and reaches the PR
step, the owner is unchanged, community / undeclared get the ephemeral
`not authorized` and never run (IDENTITY-11.a), and a
team member demoted mid-run gets no PR; `/session start` stamps the role
without the work flag; `/admin people role` promotes / demotes with
`admin-people-role` `started`/`ok` rows, no-change on the same role, refuses
the owner role, unknown roles, undeclared people, the owner's own person and a
missing role (`denied` rows, file unchanged), refuses a non-owner (even team)
and a missing audit trail; `people list` shows each role, `config show` counts
them; JSON files keep unread keys. `tests/discord.admin-slash.test.ts`: the
`people` group ends with `role` (`person`, `role` with team / community
choices).

Community can't start /work (IDENTITY-11.a, REQ-discord-065 / REQ-discord-088):
`tests/roles.community-no-work.test.ts` — a temp git repo as the project and a
temp worktree base; through `handleSlashInteraction`, a `/work` by declared
community, a declared person with no role and an undeclared user (also with a
`project` option, with no owner and nobody declared, and with no owner but a
people file) gets exactly one ephemeral `not authorized` reply, no deferred
reply, no session, work task, agent run or PR step, and the repo keeps one
worktree and no `talk/*` branch; with no owner a declared team member still
runs as team; a muted or deny-listed team member is refused the same way at
the handler, and through the dispatcher gets the mute reply / zero-width ack
first with nothing started;
the owner and a team member still run with a worktree under the base,
`workTask: true` and the PR step; a demotion / promotion written to the
people file applies to the next `/work`; through `startBridge` a community
`/work` spawns nothing while the owner's runs. `tests/work.pr.test.ts`,
`tests/discord.actor-gate.test.ts` and `tests/roles.team.test.ts` expect the
refusal for community; `tests/safe.injection.test.ts` keeps the SAFE-13
refusal for a stranger's injected `/work`. Tests that drive `/work` as a
non-owner declare the invoker team with `tests/fixtures/team-people.ts`.

Forget on request (MEMORY-ACL-6, #101 / REQ-discord-101):
`tests/discord.forget-card.test.ts` — the Approve/Deny card helper
(`cvok:<kind>:<decision>:<id>` round trip, junk refused, Approve danger /
Deny grey, expiry, text); `memory-forget-me` records one pending ask per
person for a declared person, a community member and an undeclared user,
audited `memory-forget-request` started / ok, deleting nothing; refused with
no actor, outside a conversation, with arguments and with no owner. Through
`startBridge` with a fake gateway: `deliverForgetCards` DMs the owner one card
(`Action:` / `Target:` / `Amount: 6 memories (5 stored, 1 earlier versions),
1 session turns and 0 kept conversations` one line each, request id, the
one-time code note, lapse; no content) with Approve / Deny; a non-owner
press (even the asker) is refused ephemerally with a `denied` row; the owner's
Approve (SAFE-19, REQ-discord-096) answers the press first with Enter code /
Deny and DMs the code apart (never in the card's message), deleting nothing;
Enter code opens the `cvok:forget:submit:<id>` form, and the code typed there
(lower case accepted) deletes every memory row of that person (profile,
private, superseded, legacy and alt Discord-id scopes) and their session
turns, stored and in the running bridge's session thread, keeps other
people's and project memory and the people list, writes `started` / `ok`,
answers the submit first (privately), then DMs the asker and marks the card
told; a second press finds it closed. Deny deletes nothing and, when the DM fails, tells the asker in their
allowlisted conversation. The chat path delivers the card after the message.
A keyed audit chain with no key refuses the code's approval and leaves the
ask pending (SAFE-5 fail closed). With a fake clock an unanswered ask expires
on the pass (card closed, asker told) and a late Approve deletes nothing.
Schema v12: a v11 DB migrates keeping memories, `forget_requests` has no
free-text column, one pending ask per subject, re-running is a no-op.
`tests/watch.session-store.durable.test.ts`,
`tests/store.conversation.test.ts` and `tests/scheduler.ask-outbox.test.ts`
expect `SCHEMA_VERSION` 14 (v13 kept conversations, REQ-discord-472; v14
approval cards, REQ-discord-096).

## Forget from GitHub and /admin people forget (REQ-discord-1016, MEMORY-ACL-6.a)

- `tests/discord.admin-forget.test.ts` — `/admin people forget` is registered
  with one required `person` string; through `startBridge` the owner's
  `/admin people forget person:Tofu` writes `admin-people-forget` started /
  ok, one pending ask (`admin:<owner>` → `person:tofu`), replies with the
  request id and DMs the owner the card ("started by you with /admin people
  forget", no content) at once; a second run reuses the ask; Approve and the
  one-time code (`tests/fixtures/approval-code.ts`) delete
  Tofu's memory and session turn but never the owner's own note or turn, DMs
  nobody else, adds no "told" line and marks the ask told; an undeclared id
  and a Discord id are refused (`denied`), no person gives the usage, a
  non-owner gets `not authorized` (dispatch floor; called directly, the
  handler's re-check with a `denied` row), no DB and a keyed chain without the
  key refuse with nothing asked; `forgetTargets` for a GitHub ask adds its
  login and numeric id and never takes a `github:` / `admin:` asker for a
  Discord id.
- `tests/watch.forget-me.test.ts` (watch spec) drives the GitHub ask through
  the same bridge card: the card names `@login (GitHub account id N) in
  owner/repo#n`, the bridge never DMs a GitHub asker and marks the card "They
  will be told on their GitHub thread.", and Approve deletes kept WATCH
  threads by login and by `github-id:<n>`.
- `tests/discord.admin-slash.test.ts`: the `people` group ends with `role`,
  `forget`.

## Approve / Deny card engine and one-time codes (REQ-discord-096, SAFE-18..20)

- `tests/discord.approval-cards.test.ts` — engine over in-memory SQLite with a
  fixed clock and recording DMs (`storedApprovalKind` kinds), and the bridge
  with a fake gateway (the `forget` kind):
  - SAFE-18: an 84-line diff with a ```` ``` ````, `@everyone` and a fake token
    goes out before the card as `Diff for request <id> (i/n) — quoted as
    data` parts in a ```` ```diff ```` block, each ≤ 1900, together exactly the
    scrubbed diff (token redacted, mention defanged, fence broken); the card
    is last and alone has Approve / Deny, `Action:` (line break shown ⏎) /
    `Target:` / `Amount:` one line each, the parts count, request id and hash;
    a 501-character action, and a text needing over 10 parts, are never sent
    (logged) and lapse as a no.
  - SAFE-19: a kind with no class is destructive — Approve updates the card to
    Enter code / Deny and DMs the code apart (no components; the code in no
    card message, `approval_codes` row or audit row); Enter code opens the
    `submit` form; the code acts once (`approval-card`, `approval-code-issue`,
    `approval-approve` started / ok), a second submit is "Already closed";
    the waiter consumes it once. Money needs the code; plain acts on one press.
    Late code (2 min), another card's code, a wrong code: refused, the open
    code voided, card back to Approve / Deny; a new Approve's code works.
    A failed action (`started`, `error`) leaves the request pending and the
    same code no longer works. A code that could not be DMed is voided.
  - SAFE-20: an unanswered card expires on the pass (card marked, codes void);
    a code submitted after the card's expiry does nothing (the code expiry is
    capped at the card's); a request whose waiter process is gone is closed
    before delivery, or on Approve after it; `waitForDecision` closes an
    unanswered or aborted request as expired and reads another connection's
    decision.
  - The card binds what it showed: a stored request whose row changed after
    its card went out (as a re-scrub would) is closed as changed on Approve
    (nothing done, no code), and the fresh card shows the new amount, records
    its hash, and its Approve with the code acts.
  - Bridge: muting the owner between Approve and the code submit refuses the
    submit (and another user's), `memory-forget-approve` `denied` rows, and
    after unmute the same code works; a press carrying typed text or a submit
    without it is ignored; with `disableScheduler` and no chat the engine's own
    poll DMs a card recorded before the bridge started, and a second bridge
    process completes Approve and the code on that card; a forget card whose
    count changed after it went out is closed as changed (nothing deleted, no
    code) and a fresh card with the new count follows; so is a forget card a
    v13 bridge sent (posted, no `action_hash`): Approve on it deletes nothing
    and sends no code, and the fresh card's Approve with the code forgets; an
    ask that lapsed while no bridge ran is closed and its asker told on the
    poll.
  - Schema v14: a v13 DB (no approval tables, no `forget_requests.action_hash`)
    migrates keeping its forget ask, no plain `code` column, re-running is a
    no-op; `approval_requests` fields are stored scrubbed and are in
    `SCRUB_TARGETS`.
- `tests/approvals.code.test.ts` — `issueCode` (alphabet, length, salted hash
  only, expiry capped by the card, a new code voids the old), `verifyAndConsume`
  (once; any case, spaces or dashes; another card, kind or action hash refused
  and voided; late refused and voided; junk is wrong), `voidCodes`,
  `purgeOldCodes`.
- `tests/discord.gateway-no-cut.test.ts` — through the live gateway with a fake
  discord.js: a 1900-character DM and a 2000-character edit go out whole,
  1901 / 2001 (the defang counted) are refused (null / false, logged) with
  nothing sent; a card update and a code-form reply of 2000 go out whole, 2001
  throws `DiscordContentTooLongError` with nothing sent; answer parts are
  defanged before the split; the private Choose message stays ≤ 1900.
- `tests/discord.forget-card.test.ts`, `tests/discord.admin-forget.test.ts` and
  `tests/watch.forget-me.test.ts` drive Approve through the one-time code.

## Untrusted text on Discord (REQ-discord-071, SAFE-11/12/13)

`tests/safe.injection.test.ts` — the acting-user block for a stranger named
`[owner] L<zero-width>eіf <@owner>` shows the cleaned name, a `name_clash`
line and no owner facts; a stranger named like a declared person is flagged,
the real person and the owner are not; `resolveDiscordActingRole` and the
tool layer's `resolveActingRole` give community to a stranger named like the
owner even with an owner stamp; the replay block quotes a turn line that
imitates its footer or a turn label. Through `SchedulerService` a run
reporting `injection` pings the owner with the SAFE-13 line on its result
post and on its ask post. Through `startBridge` (null gateway, memory DB): a
stranger's injection starts no run, gets one reply that pings only the owner,
drops the session and audits one `injection-suspected` / `denied` row; a
declared team member is checked too; the owner's own words run unfenced; an
ordinary stranger message runs fenced with `role: community` and the name
cleaned; a run reporting `injection` pings the owner on its answer. The
`/session start` and `/work` handlers refuse a stranger's injection (no run,
no session, public refusal, owner ping post, audit row), fence an ordinary
non-owner request and leave the owner's unfenced; `slashOwnerNotice` and
`withInjectionNotice` carry the owner line. `tests/discord.slash-pending-ask.test.ts`
now expects a non-owner's free-text answer inside the fence.
› "SAFE-12/13 on the private Answer form" (REQ-discord-548 / REQ-discord-071,
through `startBridge` with a memory DB and a first run that stops on a
free-text ask): a community user's and a declared team member's Answer form
submit that tells the bot to ignore its rules starts no run, gets one
ephemeral refusal that never quotes it, posts once in the session's channel
replying to the stub with allowed mentions only the owner (the only post that
pings the owner), appends one `injection-suspected` / `denied` row (the user,
`discord:<session>`), keeps the session and its pending ask, adds nothing to
the thread and tracks the refusal post on the session; a community user's
ordinary answer resumes inside the fence (`source=ask-answer`) with
`humanText` and the thread turn the plain answer, the "Got it" ack and no row;
the owner's answer with injection-like words runs unfenced, with no refusal
and no row; a declared team member allowlisted only by a Discord role (a
non-empty user / role allowlist), whose chat run is team, answers through the
form as team too (acting role team, fence header `role: team`). The first
three and the role-id test fail on the base bridge (a run starts / the answer
is unfenced / the form resolved the presser as community); the owner test
passes on both (unchanged behaviour).
› "SAFE-12.a on a Choose pick" (REQ-discord-548 / REQ-discord-071, through
`startBridge` with a memory DB and a first run that stops on a Choose ask):
a community user's and a declared team member's pick resumes the session
with the label inside the untrusted-data fence after the button
prior-question block (`role: community` / `role: team`, `source=ask-pick`),
`humanText` and the thread turn the plain label, the option buttons cleared
at once with "Got it — **<label>**" (DISCORD-ASK-8), the ask claimed
(DISCORD-ASK-3) and no audit row (fenced, not scanned); a label that repeats
a community user's injection-like words stays fenced when they pick it; a
declared team member allowlisted only by a Discord role picks as team (role
ids resolved at press time); the owner's pick of an injection-like label runs
unfenced (`Human answer:\n<label>`), with no refusal and no row; a community
user's, a team member's and the owner's press on an option id the ask does
not have gets only the ephemeral `ASK_CHOICE_EXPIRED` (no run, nothing
posted, the ask pending, nothing in the thread) and a real pick afterwards
resumes with the label, no prompt ever holding the forged id; a pick press
on a free-text ask is treated the same and the Answer form still answers it.
All but the owner test fail on the base bridge (label unfenced / the forged
id resumes the run raw); the owner test passes on both, and the owner's
resumed prompt was compared byte for byte between the base and the branch
bridge (identical).

Ranked recall and the inject search (MEMORY-9, #67 / REQ-discord-067):
`tests/memory.recall-github.test.ts` › "MEMORY-9 ranked recall" — a question
in plain words finds the fact it is about; a key hit outranks a newer passing
mention and equal relevance goes to the newer row; › "the Discord inject
searches memory for the message" — an older fact the message is about is
injected although 25 newer rows exist (block still 20 rows); › "/work: the
project block is searched for the description" — with 25 newer project rows
the owner's `/work` (through `handleWorkCommand`) still carries the older
project fact its description is about; › "Discord spawn clears inherited
GitHub commenter keys". `tests/memory.rank.test.ts` —
`recallTerms` / `stemTerm`, `rankMemories` (idf, key weight, recency floor),
a multi-scope search keeping the newest of a key once and no private notes, a
question-words-only query matching as one substring, `recallRelevantThenRecent`,
`memorySubjectForGithub` (numeric id only: a login alone or with an id that
differs is nobody; the undeclared-under-`[people]` owner, by `[owner]
github_id`, on their Discord id) and
`projectScopeForRepo`.

## Private replies by DM only (REQ-discord-710, MEMORY-7.a)

`tests/memory.private-view.test.ts` — `privateRepliesFromUnknown` (strings
only, via `boundPrivateReplies`: at most 5, the last saying how many more were
not sent, each scrubbed then cut to 6000 with a marker — a straddling token
redacted, no lone surrogate — and a bounded list unchanged), `deliverPrivateReplies`
(DM parts ≤1900 even after the gateway's defang of a text full of `@everyone`,
scrubbed, header first; "failed" with no DM path, a null or a throwing send)
and `withPrivateNote`; through the bridge a chat reply, a button pick and an
Answer form submit DM the text to whoever asked while the channel gets only
the "sent privately" note (the "couldn't DM it" note when the DM fails) and
the session thread never holds it; `/session start` and `/work` do the same
through `SlashContext.sendDm`.
## Update post in the persona's voice (REQ-discord-025 / REQ-discord-024 modified, PERSONA-1.a, DISCORD-ANNOUNCE-4)

- `tests/discord.update-post.test.ts` › "the bridge's update post on
  ClientReady": `startBridge` with a null gateway capturing replies, an
  in-memory DB with the announcements channel set and `version` 0.0.34 (a
  version with a long section in the real CHANGELOG.md). After `onReady`:
  exactly one reply, to the announcements channel, no pinged users, equal to
  `formatBridgeLiveAnnouncement("0.0.34")`; under 400 characters; carries
  `**v0.0.34**`, the `<…/releases/tag/v0.0.34>` link and the persona's 🐦‍⬛;
  no `bridge live` header, no bullet or heading line, no newline, no
  "changelog", none of the version's CHANGELOG bullets; `scrubSecrets` leaves
  it unchanged. With no announcements channel nothing is posted.
- Same file › "formatBridgeLiveAnnouncement": the exact template for 0.0.34;
  a leading `v` and spaces dropped; the default is the package version; the
  longest plain version (six-digit parts) stays under 400 characters with the
  full link; an empty or blank version, a pre-release, `@everyone`, `@here`,
  a runtime-built fake key, a newline bullet, markdown link text and a 20-digit
  part all give the fixed Releases-page note, never echoing the input;
  `postAnnouncement` sends the note once, as is, to the announcements channel.
- `tests/discord.announce.test.ts`: default-deny and announce-channel-only
  posting unchanged; its CHANGELOG-bullet tests were removed with the bullets.
- Fails on the base sources (main 5aaf7f0 `src/discord/announce.ts`): 5 of 7
  (the bridge posted an 838-character `bridge live **v0.0.34**` + bullets
  note); passes after.
## The bridge-live note is system text: no Approve card (REQ-discord-024 modified, AUTONOMY-10.b)

- `tests/discord.update-post.test.ts` › "AUTONOMY-10.b: the bridge-live note
  is system text, so it posts without the owner's OK" (4 tests): two
  `startBridge` starts on one in-memory DB (a restart), an owner configured,
  a gateway that reports every channel as a public thread, a 5 ms card-engine
  poll with recorded DMs and an agent that would answer with model text. After
  each `onReady`: exactly one post, to the announcements channel, equal to
  `formatBridgeLiveAnnouncement("0.0.34")` and matching the fixed template; no
  hold line, no `approval_requests` row, no DM, the approved public-thread
  count still 0 and no agent call. A version of `1.0.0` plus model-looking
  text gives the fixed Releases-page note with none of it; the running build's
  own note matches the template. A `discord-post-message` with exactly the
  note's text through `runPlugin` raises one `mustask-post` card showing that
  text and a deny refuses it (AUTONOMY-10.a). `docs/discord.md`'s must-ask
  "Not on the list" line names the bridge-live note and cites AUTONOMY-10.b,
  which `hi/autonomy.md` holds.
- Fails on the base sources (main e1a24ed `docs/discord.md`,
  `hi/autonomy.md`, `src/discord/announce.ts`, `src/discord/bridge.ts`): 1 of
  11 (the doc / hi citation case); the behaviour cases pass on the base because
  the bridge already posted the note without a card, and this change records
  that as Leif's decision. A mutation that routes the note through the
  public-thread reply gate fails the two bridge cases. Passes after (11 of 11).
## One verify gate; talk worktrees start verified (REQ-discord-085)

- `tests/agent.verify-gate.test.ts`: a talk worktree made by
  `ensureTalkWorkspace` holds the verified marker (`talkWorktreeGitDir`), its
  first run that changes nothing has nothing to verify, and after a blocked
  run with an edit the next run there verifies it (REQ-agent-015).
- `tests/work.pr.test.ts`: the `/work` PR path finds the base and merge-base
  through the shared `resolveBase` (`src/worktree/base.ts`).
- `tests/spawn.argv.test.ts`, `tests/agent.ndjson-spawn.test.ts`: Discord
  spawn argv has no `--no-verify` (REQ-discord-014 / 073).
## GitHub by numeric user id only (REQ-discord-367, IDENTITY-7.a)

- `tests/identity.github-numeric-id.test.ts` — `resolvePerson` /
  `memorySubjectForGithub`: a login alone, or the owner's or a declared
  person's login with another numeric id, resolves nobody; the declared id
  resolves under any login. `[owner] github_id` from TOML (quoted or bare) and
  JSON (string or number), an invalid one ignored with a value-free issue;
  loaded from the file it joins the owner's person; an env-only owner login is
  not the owner on GitHub. A login-only entry loads without an issue, matches
  on Discord, not on GitHub, and matches once `github_ids` is added.
  `/admin people link github:` through the slash dispatcher with an injected
  `lookupGithubUser`: the looked-up id is written to `github_ids` (login kept),
  `started` / `ok` rows, the reply deferred first, live at once, a second link
  no change; a failed, missing or mismatched lookup writes nothing and audits
  `error`; a refused request and `github_id:` links make no lookup.
  `createGithubUserLookup` over a stubbed fetch: 200 → id + canonical login
  (token sent as auth), 404 → no user, 500 → status only (token never in the
  error), a payload without an id refused.
- `tests/identity.people.test.ts`, `tests/identity.owner.test.ts`
  (`isOwnerGithub` by numeric id only) and `tests/discord.admin-people.test.ts`
  (fake lookup; unlinking a login says its id still matches; the owner's
  person matched by its linked id, not the `[owner]` login) hold the rule.
- Fail on base: with the base sources (main 20a0f58) swapped in,
  `tests/identity.github-numeric-id.test.ts` fails 8 of 9 (the login still
  matches; no `[owner] github_id`; `link github:` stores no id; no lookup
  module — only "a refused request makes no lookup" holds on both) and all 9
  pass on the branch; the updated cases in the four files above fail too.

## A schedule's nested checkout needs an allowlisted origin (REQ-discord-202 modified, DISCORD-SCHEDULE-3.a)

`tests/worktree.project-scope.test.ts` ("a schedule's project inside the
bridge root"), real git repos in a temp dir:

- `resolveProjectDir` with `schedule: true` refuses (`not authorized`) a
  checkout nested in the bridge root whose origin is off the allowlist, a
  folder inside that checkout (by relative and absolute path), a nested
  checkout with no origin, any nested checkout when no GitHub allowlist is
  given, and a denied one; without the option (`/work`, `/session start`) the
  same paths still resolve.
- An allowlisted nested checkout, the empty project, `.`, the root path,
  plain folders in the root, and a root whose own origin is off the list still
  resolve for a schedule.
- `/schedule create` on the off-list nested checkout replies `not
  authorized` and stores nothing; on the allowlisted one it stores the
  schedule; a stored schedule on the off-list checkout fails its tick with
  `project resolve failed: … not authorized`, runs no agent and leaves no
  worktree or `talk/*` branch in that repo.
- `tests/scheduler.worktree.test.ts`, `tests/discord.session-worktree.test.ts`
  and `tests/scheduler.ask-outbox.test.ts` put their schedule projects in a
  checkout nested in a plain bridge root; those checkouts now get an
  allowlisted origin (and the allowlist that org), as an operator's would.
- Fail on base: with the base sources swapped in, 2 of the 3 new tests fail
  (the refusals); the "still resolve" guard passes on both. All pass on the
  branch.

## Stuck WATCH asks reach the owner by DM (REQ-discord-086, AGENT-16.a)

`tests/watch.stuck-ask.test.ts` ("Discord bridge: …"): `formatWatchStuckAskDm`
(the GitHub line, the stuck headline, the quoted question, no mention);
`createWatchAskDelivery` (a failed DM is handed back and retried only after
`WATCH_ASK_RETRY_MS`, a sent DM takes the ask once, no owner or no `sendDm`
leaves it pending, past a day it is given up and never sent, a stop while the
DM hangs hands it back); a dry-run `startBridge` with a `sendDm` stub marks
itself running, DMs the owner once for a recorded assignment ask on its tick
and clears its mark on stop.
- Fail on base: with the base's (5093b81) `src/discord/bridge.ts` swapped in,
  the bridge case fails (no mark, no DM); the DM text and delivery units pass
  on both (new module).

## Only the owner sees spend (REQ-discord-098 modified, SAFE-14.a)

Fixture tests (fake gateway recording replies and DMs, in-memory DB, fake
thinking outbound; no live Discord, no network):

- `tests/discord.spend.test.ts` — `formatAskReply` on a spend-cap ask is the
  one line "💸 Work is paused for budget." plus the owner mention (no question,
  amount, cap, setting name or `%`), status "💸 Work is paused for budget";
  through `startBridge`: a chat spend-cap stop (fallback reply, collapsed edit,
  both failing), a button-pick resume, `/work` (body, PR line "PR: not opened —
  Work is paused for budget.", owner notice "💸 <@owner> /work `…`: Work is
  paused for budget.") and `/session start` carry no spend detail, while the
  owner gets one DM with the details per cap episode (again after a re-arm or
  a handed-back ping) and one DM per pending 80% warning — also when the post
  failed or the interaction token expired, and for a warning a WATCH-style
  process recorded; a chat answer, collapsed edit and schedule ✅ post with a
  warning pending carry no warning line and ping nobody; `/status` shows the
  owner "Spend (24h): $4.10 of $5.00 daily cap (82%) — ⚠️ past 80%" (then
  "$5.10 … (102%) — 🛑 cap reached") and "Spend cap: off (set
  CORVIDINHO_DAILY_SPEND_CAP_USD …)" with no cap, and a declared team member
  no spend line under the cap or with none set and "Spend: Work is paused for
  budget." at the cap.
- `tests/discord.spend-dm.test.ts` — `SPEND_PAUSED_TEXT` / `SPEND_CAP_SUMMARY`
  and `formatSpendPublicStatusLine` / `spendPaused` (REQ-agent-098),
  `formatSpendStopDm` (head, channel,
  scrubbed and defanged question), `spendStopFor` (only a spend-cap ask whose
  post claimed the ping), `createSpendDm`: the pending warning DMed once with
  current amounts, the run's own warning without a DB, a DM that returns null
  or throws keeps its claim, is retried on the next pass and is logged once
  per failure streak without amounts, `waiting()` while one waits, a newer
  held stop replaces an older one, no owner or no DM path claims nothing
  (one log line), and concurrent passes send a held stop once.
- `tests/discord.rich-replies.test.ts` — a split fallback answer to someone
  else with an 80% warning is the answer alone (DISCORD-16 split unchanged,
  no owner mention, footer model and time only, DISCORD-15.a) and the owner
  gets the warning by DM; the DISCORD-15.a footer tests are unchanged.
- `tests/discord.collapsed-ping.test.ts`, `tests/scheduler.ask-outbox.test.ts`,
  `tests/discord.slash-pending-ask.test.ts` — the collapsed pings, the daemon
  pending-ask post and the slash answers above; `tests/docs.operator-facts.test.ts`
  — the `docs/discord.md` `/status` row says the spend line is the owner's.
- Fail on base: with `origin/main`'s (f687a5a) `src/agent/{index,spend-alerts,spend-notice,spend-outbox}.ts`,
  `src/discord/{ask-ping,bridge,slash-types,spend-post}.ts`,
  `src/discord/command-handlers/{session,status,work}.ts`,
  `src/scheduler/service.ts` and `docs/discord.md` swapped in (and
  `src/discord/spend-dm.ts` removed), 29 tests in the six existing files fail
  on their assertions and `tests/discord.spend-dm.test.ts` cannot load; with
  the branch restored all 154 tests in the seven files pass.

## A schedule's question blocks it until answered or cancelled (REQ-discord-606, AUTONOMY-6.a; REQ-discord-045 / 347 / 353 / 548 modified)

Fixture tests only: in-memory or temp SQLite, injected agents, recorded
posts and DMs, `startBridge` with a null gateway and fake interactions; no
live Discord, no network, no token.

- `tests/scheduler.ask-block.test.ts` — a clarify ask blocks: the next due
  slots are skipped (`{ started: [], skipped: [id] }`, `next_run_at` on the
  next slot, no run row, `execution_count` unchanged), one wait note (no
  mention; the ask's Answer + Cancel controls) and no second one; after Cancel nothing is made up
  and the next slot runs with no answer. A stuck ask, a spend-cap stop and a
  run that could not start block the same way (never reaching the
  auto-pause); the auto-pause ask blocks and `/schedule resume` leaves it
  open; an ask claimed but never posted (a crash between the claim and the
  post) still gets its controls on the one wait note, and they close it; a daemon's due run waits too (`ask_skip_at`) and the bridge posts the
  ask, then the note. Controls: Choose + Cancel for listed choices, Answer +
  Cancel for free text, their hints, no reply hint; a spend-cap stop Cancel
  only (its note too) with "💸 Work is paused for budget." and a note
  without amounts; an
  in-process post that fails is posted by the next tick. No channel: the
  ask and the note, each with its controls, by DM to the owner, nothing
  without an owner. The owner's pick reaches the next run unfenced and once; the
  creator's typed answer is scrubbed at rest and fenced; a closed ask cannot
  close again. A v14 DB migrates to v15 (the eight columns; earlier asks
  that were posted or are moot closed `superseded`, not open or pending, and
  that schedule runs; a still-pending ask on its schedule's newest run open
  and blocking, posted with Answer + Cancel, its schedule waiting; a re-run
  changes nothing); `ask_answer` / `ask_options` are re-scrubbed.
- `tests/discord.schedule-ask.test.ts` — through `startBridge`: the
  `srun_` ask id and the `cancel` kind; Choose shows the creator the choices
  privately and a pick closes it `picked` (a re-press is refused); an unknown
  option id is `ASK_CHOICE_EXPIRED`; Answer opens the form, a thin submit
  restates privately and keeps it open, a typed submit closes it scrubbed,
  `cancel` typed cancels; someone else's Cancel or submit is refused, the
  owner's and the creator's Cancel close it; a spend-cap ask refuses Choose
  and a submit and takes Cancel; a three-day-old ask still takes a pick
  (DISCORD-ASK-5 is for session asks); the channel gate (zero-width ack, the
  owner's tip, the schedule's channel off the allowlist), a deny-listed and a
  muted creator; a channel-less schedule answered in the owner's DM and
  refused from a guild channel; the creator's injection-like answer closes
  nothing and pings the owner; a Cancel id on a session ask is refused; on
  a paused schedule the ack of a Cancel, a typed answer or a pick ends with
  `SCHEDULE_ASK_PAUSED_NOTE`. With
  the bridge's own scheduler: the ask post carries Choose + Cancel, a reply
  to it leaves it open, Cancel closes it; a channel-less schedule DMs its ask
  and controls to the owner.
- Rewritten for the blocking: `tests/scheduler.ask-outbox.test.ts` (a run
  after an ask cancels it first; staleness by a cancelled ask and by a later
  run another ticker finished) and `tests/discord.ask-ping.test.ts` (the
  AUTONOMY-2 dedupe harness cancels the open ask before each run); schema
  version assertions follow v15.
## /work checks tests against the merge-base (REQ-discord-185, AGENT-15)

`tests/agent.test-evidence.test.ts` › "/work checks the tree against the
merge-base before commit and push" (temp repo, bare `origin`, a `talk/…`
worktree, stubbed plugins and lane): a test removed in an earlier commit on
the branch → `opened: false`, reason `tests-deleted`, the line names
`"keeps order" (tests/math.test.ts)` and `main`, no plugin call, no lane,
nothing on the remote; a `git mv` rename of the test file with a pre-push
lane that prints no test summary → `verify-failed` naming the missing
summary, no plugin call; the same with a `bun test` summary → opened
(`pre-push`), `git-commit` → `git-push` → `github-pr-create`. Both fail on
the base (the PR opens). `tests/work.pr.test.ts`: the pre-push stub that
must ship prints a `bun test` summary.
## Must-ask cards and channel posts (REQ-discord-097, AUTONOMY-9.a / 10 / 10.a)

`tests/must-ask.gate.test.ts` ("the bridge's card engine answers the gate's
cards") — `mustAskApprovalKinds` on `createApprovalCards`: the gate's prod
card goes out with its command first as quoted data, Approve alone runs
nothing, Approve plus the one-time code runs it once; a channel-post card is
plain (no code), one Approve runs the post and Deny runs nothing. ("a prompt
can't reclassify an action") `discord-post-message` text claiming no OK is
needed still raises the `mustask-post` card for `Discord channel 999` with the
defanged text. `tests/discord.allowed-mentions.test.ts` — the card's text is
exactly the body that is posted. `tests/discord.requester-perms.test.ts` —
the DISCORD-8 checks run on an approved post (the refusals its own checks give
raise no card).

## No provider at start and in /status (REQ-discord-079, REQ-discord-015; AGENT-10)

`tests/agent.providers.test.ts` — a dry-run bridge with no model warns
`[discord] <notice>` once at start (none with a model); `/status` gives the
owner the full notice and anyone else only "No model provider is
configured." with no setting name; configured and partly configured lines.
`tests/discord.slash.test.ts` ("/status reports metrics"), `tests/version.test.ts`
(`formatLlmStatusLine` without `ownerView` gives the non-owner line, fail
closed) and `tests/discord.spend.test.ts` (the non-owner body still has no
`CORVIDINHO_`). Bridge footer tests configure a model for the file
(`useConfiguredModel`, `tests/fixtures/fake-llm.ts`); the stub agent calls
no model. `tests/discord.failed-reply.test.ts` ("no provider configured: the
owner sees the AGENT-10 notice") — the owner's own failed run answers the
notice as its one line (DISCORD-3.b, REQ-discord-032).
- Fail on base: the startup and `/status` cases fail (no line; "demo stub").

## Model fallback on Discord (REQ-discord-080, REQ-discord-457; AGENT-11)

`tests/agent.fallback.test.ts` ("Discord: …"): `answerSpendFor` with
`usageByModel` prices each model at its own price (a kind prefix stripped;
one unpriced model with tokens makes the cost unknown); the Discord spawn
client returns `model`, `modelFallback` and `usageByModel` from a fake bin's
result frame, calls `onModelFallback(hops, sessionId)` and by default logs
`[discord] llm.fallback: gpt-5 failed (HTTP 404), fell back to gpt-4.1
(session s2)`; a dry-run bridge answering the owner collapses the answer with
the note kept and the footer `gpt-4.1 (fell back from gpt-5) | 3k tokens |
$<sum of each model's cost> | <time>`, and anyone else's footer is
`gpt-4.1 (fell back from gpt-5) | <time>` with no tokens or `$`. The split
keeps the note whole in the last part ("the closing note survives every
clip").
- Fail on base: all of these fail with the base's sources (the footer names
  the configured model, prices the total at one model, and no log line).

## Surface stamp for the shell gate (REQ-discord-735; SAFE-3.a)

`tests/discord.safe3a-surface.test.ts` — the Discord spawn client writes the
caller's `surface` (`chat`, `ask`, `session`, `work`, `schedule`) to
`CORVIDINHO_ACTING_SURFACE` and an empty one when none is named, never the
bridge's own stale value; through the bridge a chat message, an ask-button
pick continuing it (same session and cwd), `/session start` and `/work` pass
`chat`, `ask`, `session` and `work`; a scheduler tick passes `schedule`.
- Fail on base: with the base's (507d97b) sources swapped in, all three fail
  (no stamp; `surface` undefined).

## One run at a time per session, and stop (REQ-discord-301, REQ-discord-302; AGENT-3.a, AGENT-3.b)

`tests/discord.run-queue.test.ts` — dry-run bridge with stub agents that wait
until the test finishes them: a second message in the same thread session
starts no second run and no second progress message while the first runs,
then runs in the same session with the first answer in its replayed thread
and its own progress message; three messages run in the order sent; runs of
another user's thread session and another channel are in flight at once; a
waiting message's in-flight row exists (no progress message) while it waits
and is gone when it finishes; a message whose session ended while it waited
runs and posts nothing; a waiting message whose author is muted or
deny-listed, or whose thread is deny-listed, while it waits runs and posts
nothing and leaves no row; a Choose pick made during a chat run waits for it and
resumes with the label and that run's answer in its thread, and one whose
presser is muted while it waits does not resume; `/session start`
and `/work` hold their session's turn (the requester's @mention meanwhile
waits); the bridge's stop aborts the run going, starts nothing waiting, posts
nothing and keeps both rows. `SessionRunControl` units: FIFO per session,
parallel across sessions, idempotent `done`, a released turn never starts,
`noteForgotten`, `close`.

`tests/discord.stop-run.test.ts` — 'stop' from the requester in their thread
aborts the run once, gets one `⏹ Stopping the run.` reply and the progress
message becomes `⏹ Stopped` with the footer `<model> | <time>` (the owner's
own run: `<model> | 2k tokens | $<cost> | <time>`), and `⏹ Stopped` (not
`stop`) joins the thread; 'cancel' as a reply to the running progress message
stops it; the owner's reply stops someone else's run and starts no session of
theirs, a third user's does nothing; a second 'stop' aborts nothing more;
two waiting messages run after a stop, in order, not aborted; with nothing
running 'cancel' clears the ask with `ASK_CANCELLED_ACK` and 'stop' runs the
agent; a pick's run stops by a reply to its Choose stub; `/session start` and
`/work` stop by a reply to their progress message (the `/work` answer says
`PR: not opened — the run was stopped.`, task `failed` / `stopped`), and so
does a stop that lands after the `/work` agent exited, while its private
reply's DM is still going out; 'cancel' during a chat run with a button ask
open stops the run and leaves the ask pending; the real
spawn client over a fake `sh` bin: the agent and its background child are
killed; a fake `bun` bin that raised a must-ask card as its own waiter: after
the stop the request is `expired`; `routeMessage` gives `stop_run` for the
requester and the owner even when the progress message is a tracked bot
message, not for other text, a third user, another channel or a finished
run, and refuses a deny-listed requester quietly; `isStopRunText` accepts
only the two words.
- Fail on base: with the base's (af4597e) sources swapped in for the six
  modified files (the new `run-control.ts` kept so imports resolve), 23 of the
  29 tests fail; the 6 that pass are the `SessionRunControl` / `isStopRunText`
  units, "different sessions still run in parallel" and "with nothing running
  'cancel' … 'stop' goes to the agent as before", which hold on the base.
- Review fixes: with the branch's pre-review (13597b4) `bridge.ts` swapped in,
  the two gate-after-waiting tests fail (the waiting message and the waiting
  pick still run); with its `work.ts`, the late-stop `/work` test fails (the PR
  step runs and the task is `completed`).

## The Stop button on a run's progress message (REQ-discord-303; AGENT-3.a, AGENT-3.b)

`tests/discord.stop-run.test.ts` ("the Stop button on a run's progress
message") — dry-run bridge, stub agents, in-memory outbound, fake LLM fixture
model: a chat run's progress message goes out with one row holding one red
`Stop` button (`cvstop:run_<n>`) and working edits carry no components; the
requester's press gets only the ephemeral `⏹ Stopping the run.`, aborts the
run once, posts nothing public, and `⏹ Stopped` (footer `<model> | <time>`,
error colour) clears the button, after which a press gets `Nothing is
running.`; a third user's press gets `This Stop button isn't for you.` and the
owner's press stops someone else's run without a session of theirs; a
finished run's answer clears its button and its button, another run's id, the
live button in another allowlisted channel and a pre-restart button all get
`Nothing is running.` (in an unknown thread, the zero-width ack) and abort
nothing; a failed answer and the failure status of a run that throws clear it;
a deny-listed thread (zero-width, the owner the allowlist tip), a deny-listed
requester and a muted requester are refused and stop nothing, a form submit
with the Stop id is ignored; a second press and a 'stop' reply while it winds
down abort nothing more; after a press two waiting messages run in order,
each with its own button; a pick's resumed run shows the button on its stub
and stops by it; `/session start` and `/work` show it and stop by it (the
`/work` answer says `PR: not opened — the run was stopped.`); the restart's
interrupted notice edits with `components: null`; `parseStopRunCustomId`
refuses every other id. `tests/discord.thinking-status.test.ts` ("the
progress message's Stop button") — `ThinkingStatus` sends the components with
the progress embed (a reused stub: `editMessage`, else `editEmbed`), working
edits leave them, `done` / `fail` send `components: null`, the collapsed
answer carries none or its own; without components no call has a
`components` field. `tests/discord.ask-answer-modal.test.ts`: the Answer
form's resumed run shows the Stop button on the stub and its answer clears it.
- Fail on base: with the base's (9ea4005) sources swapped in for the six
  modified files (`bridge.ts`, `thinking-status.ts`, `gateway.ts`,
  `inflight-replies.ts`, `command-handlers/session.ts`,
  `command-handlers/work.ts`; the branch's `run-control.ts` kept so imports
  resolve), 14 of the 17 new or changed tests fail; the 3 that pass are the
  custom-id unit (new module), "the collapsed answer replaces it" and
  "without components nothing changes", which hold on the base.
## Stopping a scheduled run from Discord (REQ-discord-304; AGENT-3.c)

`tests/discord.schedule-stop.test.ts` — dry-run bridges (fake gateway,
in-memory outbound, memory SQLite, the scheduler polling every 20 ms), stub
agents that wait until finished (an abort ends them like a killed process):
a due schedule's run sends one progress embed `⏳ Schedule **<name>** …
running.` to its channel with one red `Stop` button (`cvstop:run_<n>`) and
its agent gets a signal and the `schedule_<id>` session; a third user's press
gets only `This Stop button isn't for you.`; the creator's press gets only
`⏹ Stopping the run.` and aborts it once; the row is `failed` / `stopped` /
`stopped on Discord by <creator>` with no ask, the schedule `active`, its
failure count 0 and its next run in the future; the progress message ends
`⏹ Stopped` with `components: null`; nothing is posted; a later press gets
`Nothing is running.`; the next due run gets its own button, posts its ✅
result and its progress message is deleted. The owner's `Cancel!` reply to
someone else's schedule run's progress message stops it (one ack reply to the
stop message; no session of the owner's); a third user's `stop` reply does
nothing. A schedule with no channel DMs the owner the line, then adds the
Stop button; the owner's press there (no guild) stops it and the DM becomes
`⏹ Stopped` with `components: null`; the owner's later press there gets only
`Nothing is running.` (not the allowlist tip) and another user's DM press on
it keeps the channel gate; a run that ends on its own has its DM deleted;
nothing goes to a channel; the same message pressed in a guild channel off
the allowlist stops nothing. `SchedulerService` with a fake
control: at `FAILURE_AUTO_PAUSE - 1` failures a stopped run keeps the count
and the schedule `active`, stores and posts no question, and finishes the
control once; a stopped run whose tool result looked like an injection
(SAFE-13) posts exactly one line to its channel, `⏹ Schedule **<name>** … :
stopped.` with the owner's `🛡️ <@owner> heads-up: …` line, mentioning only
the owner and not marked model text; a run nobody stopped finishes the
control before its ✅ post;
a `begin` that throws is logged and the run goes on; a run abandoned at
shutdown keeps `interrupted: bridge shutdown`. `createScheduleRunStop`: no
owner or no DM gives null; a DM whose button edit fails (returns false, or
throws and is logged) is deleted and its turn released; a channel run's turn is `schedule_<id>` / the creator / the
channel, `SessionRunControl.stop` aborts the handle's signal, `finish`
resolves the stopper (twice), releases the turn and edits `⏹ Stopped` with
`components: null`.
- Fail on base: with the base's (8bf4422) sources swapped in for the four
  modified source files (`bridge.ts`, `scheduler/service.ts`,
  `scheduler/store.ts`, `scheduler/index.ts`; the branch's new
  `schedule-stop.ts` kept so imports resolve), 8 of the 10 tests fail; the 2
  that pass are the `createScheduleRunStop` units (the new module itself).
  With only the SAFE-13 stop line taken out of `scheduler/service.ts`, the
  injection test fails; with only the stale-DM-press branch taken out of
  `bridge.ts`, the no-channel test fails (the owner gets the allowlist tip);
  with a throwing DM edit left uncaught in `schedule-stop.ts`, the DM unit
  fails (the turn stays held).
## The owner's own schedule runs as the owner (REQ-discord-741; DISCORD-SCHEDULE-1.a)

`tests/scheduler.owner-role.test.ts` — with `loadOwner` returning the owner,
the owner's due schedule is spawned with `actingIsAdmin: true`, no
`actingRole`, surface `schedule`, session `schedule_<id>` and its prompt
unfenced, and its result post goes straight to its channel; a declared team
member's and a stranger's schedules are spawned `actingIsAdmin: false` with
no `actingRole` (never team); started with one owner while `loadOwner`
names another, the old owner's schedule is community (fenced
`role: community`) and the new owner's runs as the owner (one read per run);
`loadOwner` returning null, throwing (logged `[scheduler] owner failed: …`)
or a muted owner give community; without `loadOwner` the start-time owner is
used; an owner schedule on a non-git project runs in its own
`scoped-talk-schedule_…` folder, never the project folder. Through the real
spawn client (a fake bin that resolves the role in the child) the owner's
schedule resolves `owner` with stamps `1` / `owner` / `schedule` and the
shell gate says "scheduled runs never get them", and a team member's resolves
`community`. In process, with the owner's schedule stamps, a
`discord-post-message` the model starts raises one `mustask-post` card with
the exact text; denied, the run ends `blocked` with the stuck ask naming the
tool and card and the scheduler records it: the ask posts to the channel
pinging the owner with its controls, and the next two due ticks run nothing,
raise no new card and post one wait note. The owner's schedule stamps still
give no private place: project memory works, but private notes, a `--person`
view and `memory-profile` are refused with no `privateText`, and
`discord-send-file` passes the role check and is refused for want of a
conversation channel. The daemon (`startDaemon`) and the
bridge (`startBridge`, null gateway) spawn the owner's schedule as the owner,
and after the allowlist file names another owner the next run is community.
- Fail on base: with the base's (af4597e) `src/scheduler/service.ts`,
  `src/plugins/roles.ts`, `src/agent/execute.ts`, `src/discord/bridge.ts`,
  `src/daemon/daemon.ts` and `src/discord/agent-client.ts` swapped in (the
  additive `mustAskRefusedAsk` kept so the file loads), 11 of the 18 tests
  fail; the read-only, owner-chat, other-person, no-private-place and
  `mustAskRefusedAsk` unit guards pass on both. All pass on the branch.
## /work checks SpecSync change coverage (REQ-discord-518, AGENT-18)

`tests/agent.repo-ways.test.ts` ("/work checks SpecSync coverage before
commit and push"): a /work worktree of an SDD repo (bare `origin`,
`origin/HEAD` set) with `src/app.ts` edited and no change is refused with
`sdd-uncovered` naming the path and no plugin call; a change archived on the
branch covering it ships through `git-commit` → `git-push` →
`github-pr-create`; deleting `sdd.json` and committing on the branch still
gets `sdd-uncovered`. Both fail on the base (the PR opens).
## Each spend cap on its own, owner only (REQ-discord-098 modified; SAFE-14 / SAFE-15, SAFE-14.a)

`tests/agent.spend-caps.test.ts` › "delivery keeps each cap apart" and
"spend_alerts gains its scope column in place" — the owner's DM carries one
80% warning line per cap (a provider's names `provider:<id>`); `askPingOwner`
pings the owner once per episode of each cap a stop tripped (another
provider's stop and the total's each ping; a released claim pings again; a
schedule run's stored question-only stop claims its own caps through the
"Stopped at cap" marker); a schedule's `askPingKey` follows the provider caps
(the total alone keys as before); the public spend-cap post names no scope,
provider, amount or setting; `SCRUB_TARGETS` lists `spend_alerts.scope`, a
secret-shaped provider id is stored and re-scrubbed redacted, and a re-scrub
over a `spend_alerts` without `scope` does not throw. The owner's `/status`
lines per cap and the public "Spend: Work is paused for budget." while any
cap is reached are covered by "doctor and the owner's /status show each cap".
The SAFE-14.a surface tests (`tests/discord.spend.test.ts`,
`tests/discord.spend-dm.test.ts`, `tests/scheduler.ask-outbox.test.ts`,
`tests/discord.collapsed-ping.test.ts`) pass unchanged.
- Fail on base: the file cannot load on main's (7090656) sources.


## The spend card on the bridge's engine (REQ-discord-198 added; SAFE-8, SAFE-8.a, SAFE-18, SAFE-19, SAFE-20)

`tests/discord.spend-card.test.ts` (6 tests; in-memory or temp-dir SQLite,
the fake LLM as an injected fetch, the real card engine with recording DMs,
the bridge with a fake gateway): the owner is DMed the task as quoted data,
then the card (title, action, target `total`, amount, the code note); Approve
alone sends nothing, Approve plus the code DMed apart sends the paused call
once and answers `SPEND_CARD_APPROVED`, the request ends `used` and the
`spend-cap-card` / `spend-cap-approve` rows are on the audit chain; Deny sends
nothing and the card says "Denied by you — nothing was spent."; another
user's Approve and code are refused ("Only the owner can answer this card.");
a code typed after the card lapsed is a no; a card whose waiting process is
gone is closed on the next pass; the bridge DMs a spend card another process
recorded with its `cvok:spend:approve:<id>` button and answers Approve with the
code step. The SAFE-14.a surface tests (`tests/discord.spend.test.ts`,
`tests/discord.spend-dm.test.ts`, `tests/discord.approval-cards.test.ts`,
`tests/scheduler.ask-outbox.test.ts`) pass unchanged.
- Fail on base: the file cannot load on main's (0aeb345) sources
  (`src/discord/spend-card.ts` does not exist), and main's bridge has no
  `spend` kind, so such a card is never DMed.

## A failed run says why to the owner, and that the owner was told to anyone else (REQ-discord-032, DISCORD-3.b)

`tests/discord.failed-reply.test.ts` (22 tests; stub agents, a dry-run
`startBridge` whose gateway stub records replies and `sendDm`, in-memory
SQLite, a `SchedulerService` with a recording poster, a localhost provider
that answers 401; no live Discord, no network):

- `failureReasonFor` / `plainFailureLine`: the result frame's `error` wins; a
  key in stderr is `[redacted:openai-key]`, also when the cut would split it;
  a stderr with a source excerpt, stack frames, host paths and the Bun banner
  becomes the one `error: …` line with `…/corvidinho`; a long line is cut to
  200 with `…`; URLs keep their host; `@everyone` is defanged; with no reason
  the AGENT-10 notice (unset model, missing key), else the stderr end, else
  the exit code (130 = interrupted); never the summary.
- `createFailureOwnerDm`: one DM per reason per hour (a later hour or another
  reason sends again); a DM that fails (null or a throw) is false and not
  remembered; no owner or no DM path is false.
- `failedRunReply`: owner → the reason; others → told (DM out) or the plain
  line (DM failed, none wired); one `[discord] run failed (<surface>, exit N)`
  log line each.
- Spawn client: a result frame's `error` becomes `failureReason`; a crash
  with no frame hands over `stderrTail`; a successful run carries neither.
- Surfaces through `startBridge`: chat (owner body = the reason, footer keeps
  `state=failed verified=false attempts=1`, no DM; a team member's run is
  told and DMs the owner once per reason; a failed DM or no owner → `That
  didn't work.`; no provider → the AGENT-10 notice to the owner; a secret and a
  stack in stderr reach the owner as one scrubbed line; a run that throws →
  `❌ <scrubbed line>` for the owner, `❌ That didn't work — the owner has been
  told.` for anyone else), an ask pick (owner and team), `/session start` and
  `/work` (owner and team, `failed (exit` never shown), and schedule posts
  (the owner's schedule posts the reason and keeps it as the row's error;
  someone else's is told with the DM naming `schedule <id>`; the daemon or a
  failed DM → `That didn't work.`; `[scheduler] run failed (schedule <id>,
  exit 1): …` logged).
- End to end: the bridge spawning the real `task run` against the 401
  provider answers the owner `The model call failed (401 Unauthorized from
  127.0.0.1:<port>)` and a team member `That didn't work — the owner has been
  told.` with the owner DMed that line; the provider's body never appears.
- Updated for the new line: `tests/discord.thinking-bridge.test.ts`,
  `tests/discord.inflight-replies.test.ts` (non-owner, no owner → `That didn't
  work.`) and `tests/scheduler.ask-outbox.test.ts` (someone else's schedule
  without a DM path → `That didn't work.` in the row summary and the pause
  ask; the failed run's own output never shown).
- Fail on base: with the base's (9ea4005) twelve modified source files swapped
  in (`src/discord/failure-reason.ts` kept so imports resolve), the file gave
  7 pass, 15 fail; restored, 22 pass. The 7 that pass on the base are the pure
  units of the new module; every surface, spawn-client, `task run` and
  `modelCallFailedLine` case fails on the base.
## The spawn client passes --here (REQ-discord-014 / REQ-discord-073 modified; SESSION-WORKTREE-1.a)

`tests/agent.ndjson-spawn.test.ts` (Discord spawn client) and
`tests/cli.task-worktree.test.ts` › "Discord and WATCH clients spawn task
run --here" — the fake bin records exactly `task run --here --task <prompt>
--output ndjson`, the prompt `--tier=code hi` staying task text. Fail on
base: both fail (no `--here`).
## WATCH spend-cap stops, the unknown-price card, a schedule's Continue (REQ-discord-199; REQ-discord-086 / 198 / 606 modified; SAFE-16.a, AUTONOMY-8)

- `tests/spend.surfaces.test.ts` ("the bridge DMs the owner the stop's
  details …") — `createWatchAskDelivery` over a recorded spend-cap stop: a
  failed DM hands back the ask and the episode claim; the next pass DMs the
  owner once (`SPEND_STOP_DM_HEAD`, then `GitHub CorvidLabs/Corvidinho#7:
  <link>`, then the quoted details, no mention); another thread's stop in the
  same cap episode is taken and not DMed, with a log line. ("a stop while the
  owner's DM is in flight …") — a DM that hangs past the stop grace hands back
  the ask and its episode claim, so the next start DMs the owner once instead
  of dropping it as already told; a later stop in that episode is not DMed.
  Fails on the pre-review branch source (the episode stayed claimed).
- `tests/agent.spend-unknown.test.ts` ("the unknown-price card on the
  bridge's engine") — the owner is DMed `Amount: unknown (…)` (never `$0`);
  Approve plus the code sends the call once and answers
  `SPEND_CARD_UNKNOWN_APPROVED`.
- `tests/discord.schedule-ask.test.ts` ("a spend-cap stop takes the owner's
  Continue or Cancel …") — through `startBridge`: the creator's Continue and
  an Answer submit are refused ("isn't for you"); the owner's Continue closes
  the ask `continued` with no answer (`answeredAsk` undefined) and acks
  `SCHEDULE_ASK_CONTINUED_ACK` (no amount); the creator's Cancel still works.
  `tests/scheduler.ask-block.test.ts` — the spend-cap post and its wait note
  carry Continue + Cancel and still name no amount.
- Fail on base: the schedule ask test cannot load
  (`SCHEDULE_ASK_CONTINUED_ACK` missing), the ask-block test gets
  `["Cancel"]`, and main's watch delivery never sees a spend-cap stop.

## The /work PR line says why when no second-model review finished (REQ-discord-088 modified; GITHUB-9)

`tests/work.review.test.ts` ("/work: with no finished review …"):
`openWorkPr` with the real dry-run plugins in a temp repo whose bare origin
is `acme/review-fixture`: with no finished review the outcome is
`not-reviewed`, the line is `PR: not opened — no second-model review has
finished for this branch's tree on GitHub, and only an agent run can start
one (GITHUB-9). The changes stay on branch …` and the branch is pushed; with
a finished review seeded for the tree it pushes (`fullWorkTree`, the whole
work tree /work commits) it opens and the PR body has the section.
`tests/work.pr.test.ts` seeds a finished review for its two opening cases
(the shipped body, and the file-only allow).

Fail on base: the /work case fails (base `pr.ts` has no `not-reviewed`);
restored, it passes. `tests/work.pr.test.ts` only adapts to the gate (with
the base's sources it passes). Superseded by "/work commits and pushes only a
reviewed tree" below: the check now runs before the commit, so nothing is
pushed.
## Turn cap / idle timeout plumbing and card waits (REQ-discord-125, AGENT-12)

`tests/agent.limits.test.ts` ("it says so on each surface", "waiting on an
Approve card …"): the spawn client keeps `stopReason: "turn-cap"` and drops an
unknown value; a mention answer's footer ends `… attempts=1 stopped=turn-cap`
and its body is only the prose; an idle-timed-out frame gives `failureReason`
= the stop line and `task.stopReason: "idle-timeout"`, and the owner's own
mention is answered with that line (DISCORD-3.b) and `stopped=idle-timeout`
in the footer; `waitForDecision` answered after 0.9 s does not fire a 250 ms
watchdog, which fires once the card is decided. Fail on base: all four.
Review (REQ-agent-312): an owner's schedule whose run hit the turn cap posts only its prose
and the scheduler logs one `[scheduler] schedule <id>: run stopped=turn-cap
…` line (none for a plain run beside it); fails on base and on 05f7a6c.

## Its first 20 public-thread replies wait for the owner's OK (REQ-discord-099 added; REQ-discord-097 / 741 modified; AUTONOMY-10 / 10.a)

`tests/discord.public-reply-gate.test.ts` (28 tests; stub agents, a dry-run
`startBridge` whose fake gateway answers `isPublicThread`, in-memory SQLite,
the real card engine, a recording schedule poster, a fake bin for the spawn
stamp, one real `task run` against the fake model; no network):

- The gate: Discord types 11 / 10 are public threads (12, channels and an
  unknown type are not); the `schema_meta` count (`public_thread_replies_approved`)
  goes up by one per used approval and stops the waiting at 20; a lookup
  that throws is public; a plain `reply` card with the text verbatim and the
  hold note; Approve posts exactly the card's (scrubbed) text and counts;
  Deny, a lapse, a stop and `close()` post nothing and count nothing; no
  owner, no card; on the engine the text DM (fence-safe) precedes the card
  and one owner press approves it.
- The surfaces: a chat answer (even the owner's), an ask pick's answer, a
  thin ack's restatement, `/session start` and `/work` answers (their
  progress message never echoing the typed topic or description) and a
  schedule's result in a public thread wait; a clarify question is pending
  only once posted; Deny leaves the fixed `Not posted — …` line and no
  question; a plain channel, a private thread or 20 approved never wait;
  a failed run's line, a spend-cap stop and `⏹ Stopped` never wait; the Stop
  button ends the wait; the schedule poster gets `modelText` and a denied
  schedule post is not retried.
- Files: the spawn stamp (`replyPublicThread`, written `1` or empty, never
  inherited) and `discord-send-file`'s `mustAsk` (a `mustask-post` card with
  the caption and the file, only while stamped and under 20).
- Fail on base: 17 of 28 fail with the base's ten modified source files
  (the gate's own units and "outside a public thread" pass on both);
  `tests/must-ask.boundary.test.ts` fails on the base's `send-file.ts`.
## Turning /work and /schedule off (REQ-discord-157, PLUGIN-5 / PLUGIN-5.a)

`tests/plugins.extras-toggle.test.ts`:
- Dispatch: with `extraState` off, `/work` gets only `/work is turned off on
  this install.` (ephemeral), `{ ok: false, reason: "extra_disabled" }`, no
  session, work task or agent call, and the switch is read once; the owner's
  reply adds why (`[corvidinho.plugins]`, "the allowlist file", no path); all
  five `/schedule` subcommands are refused and the schedule store is
  unchanged while `/work` still runs; an off-allowlist channel, a deny-listed
  actor and a muted user still get their own replies (the switch runs after
  those gates); `/status` never reads the switch, and an unset `extraState`
  is today's behaviour.
- Bridge: `work = false` in the allowlist file refuses `/work` with the owner
  hint and rewriting the file turns it back on without a restart; off in the
  install root's `fledge.toml` is off too; a reply to a `/work` answer, and
  the owner's @mention routed to that `/work` talk, get the fixed line in the
  channel and run nothing while someone else's chat still runs, and back on
  the reply resumes the talk; after the talk's TTL, a reply to its answer
  gets the fixed line, no agent call and no new session, and back on it
  resumes the conversation as a new session (SESSION-3.a; review fix, fails
  without `refuseResume`); an open and a pick press on a `/work` talk's
  Choose ask are refused privately (with the owner hint), the ask stays open,
  and back on a pick resumes it; turning `/work` off does not abort a run in
  flight and a `stop` reply still stops it; `schedule = false` keeps the
  bridge's 20 ms ticker from claiming a due schedule until the file is
  rewritten.
- Scheduler: with `schedulesEnabled` false two ticks claim nothing while the
  `onTick` hook, the backup tick and the spend-DM pass each run every tick;
  back on hours later the overdue schedule fires once; a throwing switch is
  off; a stuck ask another ticker left pending is still posted by a tick
  with schedules off; a run in flight when it goes off still completes.

Fail on base: with the base's (cf7f61b) bridge, scheduler service, daemon,
work store, slash types and slash dispatch swapped in (the config module
`src/autonomous/enabled.ts` and the two reply helpers kept so the test
loads), 13 of the 28 tests fail — the three dispatch refusals, five of
the six bridge cases (all but the stop case), the two scheduler gate cases
and the three daemon cases — and the docs gate-order test fails; the 15 that pass there
are the config units and the must-not-break guards (other gates' replies,
`/status`, ask delivery and runs in flight while off, the stop case). With
every modified source from the base the file does not load. Restored: 28 of
28 pass. Review: the expired-`/work`-talk test above (29 in all) fails when
the router ignores `refuseResume`; with the extras loader forced to on, 10 of
the 29 fail (every loader-driven bridge and daemon case and the two loader
units), so the bridge and daemon cases depend on the switch.
## Non-git project talks in the folder itself (REQ-discord-110, REQ-discord-013, AGENT-1.a, AGENT-1.c)

`tests/discord.nongit-project-dir.test.ts` (8 tests): `ensureTalkWorkspace`
with `nonGit: "project_dir"` returns the folder and makes no
`.corvid-worktrees`; without it (and with `scoped_dir`) a non-git project gets
its own scoped folder (AGENT-1.c); park / remove with every kind on the
project folder, its parent and a git main checkout delete nothing; the session
store binds in place, re-binds after a restart, and an end, a TTL purge and an
expired row at start leave the folder; a legacy scoped row is parked and
re-bound; a switch is refused; a folder that became git gets a worktree; the
bridge writes the owner's image under
`<project>/.corvidinho/attachments/<session id>/`, removed at the talk's end,
and keeps another person's URL-only. Fail on base (cf7f61b, shims for the new
exports): 7 of 8 fail; the scoped-folder case holds on both.
`tests/scheduler.owner-role.test.ts` keeps the owner schedule's scoped folder.

## /work opens no PR while hi/ differs from the merge-base (REQ-discord-520, AGENT-18 hi guard)

`tests/agent.hi-guard.test.ts` with a temp repo, a bare `origin` and a talk
worktree from `ensureTalkWorkspace`, `openWorkPr` with stub plugin calls: a
leftover dirty hi/ edit with a verified run is refused with reason
`hi-changed` naming `criteria AGENT-19`, nothing committed or pushed; a hi/
note committed on the branch with no result frame (the fallback re-verify
path) is refused before the lane runs (the stub verify runner is never
called); a `/work` run whose `files-edit` of hi/ is refused and whose shell
edit gets through ends `failed`, opens no PR, and the tree it left is
refused even with a trusted verified result; once hi/ is restored the next
run in the talk is verified and the PR opens (`git-commit`, `git-push`,
`github-pr-create`).
- Fail on base (b84c75f's `src/work/pr.ts` and `src/agent/loop.ts` swapped
  in): the three /work cases fail (the PR opens, or the run is verified);
  restored they pass.
REQ-discord-417 (#318): `BRAVE_SEARCH_API_KEY` is on the SAFE-6 secret env
list — `redactSecretEnvValues` and `formatErrorLine` replace its value with
`[redacted:env-secret]` (`tests/web.search.test.ts`).

REQ-discord-417 (#318 slice B): `GIPHY_API_KEY` is on the SAFE-6 secret env
list — `redactSecretEnvValues` and `formatErrorLine` replace its value with
`[redacted:env-secret]`, so a GIPHY request URL in an error keeps only
`key=[redacted:env-secret]` (`tests/gif.search.test.ts`).

REQ-discord-075 (#318 slice B): an answer holding a GIPHY media link is never
one embed, so Discord can unfurl the GIF a run posts as a link (PLUGIN-8):
within 2000 characters it is plain content with the footer embed, and long
plain prose with such a link is split into parts with the link in a part's
content; another link, a `giphy.com` page URL or a look-alike host keeps the
one-embed path (`tests/discord.rich-reply.unit.test.ts`).

## The owner's hi card (REQ-discord-521 added, REQ-discord-520 modified; AGENT-18 hi drafts)

`tests/discord.hi-card.test.ts` (8 tests; temp git repos and talk worktrees,
a stand-in `hi` on PATH from `tests/fixtures/stand-in-hi.ts`, a temp DB for
the engine, the bridge with a fake gateway): the card DMs the owner the
exact commands first and then the action, project and branch, the drafter's
run, the ids and plain Approve / Deny buttons (no Enter code); a stranger's
press is refused and captures nothing; the owner's Approve captures exactly
the drafts in one commit on the session's branch that changes only
`hi/agent.md` (hi/ left clean), records the ids and the commit, writes
`hi-capture-card`, `-approve` `started`, two `hi-capture-criterion` and
`-approve` `ok` rows and posts one outcome to the asker naming the ids,
branch and commit only; a changed owner config makes Approve fail with
nothing captured; Deny and a lapsed card capture nothing and tell the asker;
a removed worktree whose branch has a commit is re-created and captured
into, a talk parked with `parkWorktree` (worktree removed, branch deleted) is
re-made at the recorded commit and captured into, and with that commit gone
too Approve fails closed and the request stays open; a worktree re-created
only for a capture is removed again afterwards with its branch holding the
commit; after `parkWorktree` an approved capture's branch is kept with the
capture's commit at its tip; a
worktree on another branch, a request naming the main checkout, an id
captured by hand since, a second draft that fails, a failing `hi check`, a
failing `git commit`, an uncommitted `hi/notes.md` and a symlinked
`hi/agent.md` each capture nothing and leave `hi/` (and a first capture's
`INTENT.md`), HEAD and the index as before, never writing through the
link. Through the bridge: the `hi` card is
delivered, a stranger's `cvok:hi:approve` is refused, the owner's captures,
and `hiChangesSince` then lists nothing for the talk. `/work` with an
approved capture opens its PR (`tests/agent.hi-draft.test.ts`,
REQ-discord-520 modified).
- Fail on base (main e1a24ed2's sources swapped in as for REQ-agent-521,
  the new modules kept): 2 of 8 fail — the re-created worktree (no `prepare`
  hook in the engine) and the bridge route (no `hi` kind registered); the
  other 6 exercise the new `hi-card.ts` on the engine directly. Without the
  new modules the file does not load. Restored: 8 of 8 pass.
## /work commits and pushes only a reviewed tree (REQ-discord-088 modified; GITHUB-9, GITHUB-9.a)

`tests/work.pr.test.ts` ("GITHUB-9: no finished second-model review for the
tree it would ship"): `not-reviewed` with `PR: not opened — no second-model
review finished for the tree this /work run would ship, so there is no PR
(GITHUB-9). The changes stay on branch …`, no plugin call, nothing pushed,
the edit still in the tree; with the run's refusal on its frame (no second
model) the line is that reason. Its opening, push-failure, PR-failure and
SAFE-1 cases seed a finished review for the tree they ship (`fullWorkTree`).
"GITHUB-9: the result frame's review outcome rides AgentSpawnResult.task":
`finished` passes, `refused` comes through with a token scrubbed and its line
break gone, a `refused` without a reason and a bare string are dropped.

`tests/work.review.test.ts`: "/work: with no finished review for the tree it
would ship, nothing is committed or pushed" (no plugin ran, HEAD unchanged,
no remote branch; a finished review of an earlier tree does not count; a
review of the whole work tree opens with the section and the reviewed line);
and the owner run through the real tool loop, verify gate and review hook
(round 1 findings changed, round 2 clean) whose /work PR opens listing round
1's finding and `M  src/greet.ts`, while with one configured model the PR
step commits and pushes nothing and its line is the GITHUB-9.a reason.

Fail on base: with the stacked base's (387dada) sources swapped in, both
`tests/work.pr.test.ts` GITHUB-9 cases fail (the base commits and pushes
before `github-pr-create` refuses, and drops the frame's `review`);
`tests/work.review.test.ts` cannot load. Restored, all pass.
