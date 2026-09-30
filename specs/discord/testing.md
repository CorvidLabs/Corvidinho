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
  kept as regression locks). Restart recovery edits and replies nothing for a
  row in the denied thread or under a denied parent and deletes the row, and
  still recovers a row in another thread under the parent.
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
  `ASK_ANSWER_ACK` then deleted, the stub thin-updated and edited into the
  answer, the typed text never posted, the thread turn recorded, the ask
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
  pause ask with the ping and the `failed (exit 1)` context (not the run's
  output) instead of the `❌` line; a pause ask whose in-process post
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
- `tests/discord.slash-ask7.test.ts` › "/work answer for a non-owner keeps the
  closing role note within the 1900 cap": a `member-1` `/work` with a
  207-char description (non-owner PR line) gets a collapsed answer of at most
  1900 chars whose summary part is under 1500 (fitted after the head) and ends
  with the note.
- Same file › "/session start answer for a non-owner keeps the closing role
  note within the 1900 cap": the answer is at most 1900 chars, its summary part
  at most 1500, and it ends with the note.
- `tests/discord.spend.test.ts` › "the cut for the warning line keeps a
  closing role note": `withSpendWarningPost` on an 1800-char body ending with
  the note gives a 1900-char post ending `y…`, the note, a blank line and the
  owner-pinging 80% line; a body that fits is untouched. The existing
  "a long post is cut so the warning line always fits" (no note) still ends
  `…\n\nLINE`.
- With `origin/main`'s `src/discord/ask-ping.ts`,
  `src/discord/command-handlers/work.ts`, `session.ts` and
  `src/scheduler/service.ts` swapped in, these four tests fail and every other
  test in their files passes; on the branch all pass.

## Declared people (REQ-discord-036, IDENTITY-13/14/6/7, ADMIN-3.a)

- `tests/identity.people.test.ts` — `[people.<id>]` TOML (plural + singular
  keys) and JSON parse; the allowlist loader and `[owner]` reader load the same
  file; unreadable entries skipped whole with id-free problems; `owner`
  reserved; `resolvePerson` by Discord id / `<@id>` / GitHub login / numeric
  id, never by display or nickname, renamed-login rule, clashes match nobody;
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
step, the owner is unchanged, community / undeclared never reach it, and a
team member demoted mid-run gets no PR; `/session start` stamps the role
without the work flag; `/admin people role` promotes / demotes with
`admin-people-role` `started`/`ok` rows, no-change on the same role, refuses
the owner role, unknown roles, undeclared people, the owner's own person and a
missing role (`denied` rows, file unchanged), refuses a non-owner (even team)
and a missing audit trail; `people list` shows each role, `config show` counts
them; JSON files keep unread keys. `tests/discord.admin-slash.test.ts`: the
`people` group ends with `role` (`person`, `role` with team / community
choices).

Forget on request (MEMORY-ACL-6, #101 / REQ-discord-101):
`tests/discord.forget-card.test.ts` — the Approve/Deny card helper
(`cvok:<kind>:<decision>:<id>` round trip, junk refused, Approve danger /
Deny grey, expiry, text); `memory-forget-me` records one pending ask per
person for a declared person, a community member and an undeclared user,
audited `memory-forget-request` started / ok, deleting nothing; refused with
no actor, outside a conversation, with arguments and with no owner. Through
`startBridge` with a fake gateway: `deliverForgetCards` DMs the owner one card
(who, count, request id, lapse; no content) with Approve / Deny; a non-owner
press (even the asker) is refused ephemerally with a `denied` row; the owner's
Approve deletes every memory row of that person (profile, private, superseded,
legacy and alt Discord-id scopes) and their session turns, stored and in
the running bridge's session thread, keeps other people's and project memory
and the people list, writes `started` / `ok`, answers the press first
(card without buttons, before any DM), then DMs the asker and marks the card
told; a second press finds it closed. Deny deletes nothing and, when the DM fails, tells the asker in their
allowlisted conversation. The chat path delivers the card after the message.
A keyed audit chain with no key refuses Approve and leaves the ask pending
(SAFE-5 fail closed). With a fake clock an unanswered ask expires on the pass
(card closed, asker told) and a late Approve deletes nothing. Schema v12: a
v11 DB migrates keeping memories, `forget_requests` has no free-text column,
one pending ask per subject, re-running is a no-op.
`tests/watch.session-store.durable.test.ts` and
`tests/scheduler.ask-outbox.test.ts` expect `SCHEMA_VERSION` 13 (v13, kept
conversations, follows v12; REQ-discord-472).

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
`memorySubjectForGithub` (id, login, a login whose id differs is nobody, the
undeclared-under-`[people]` owner on their Discord id) and
`projectScopeForRepo`.
