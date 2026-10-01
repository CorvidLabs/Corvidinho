---
module: discord
change: its-first-20-replies-in-public-threads-each-wait-for-my-ok-on-an-approve-card-even-text-i-dictated-and-replies-to-me
---

# Delta: discord (its first 20 public-thread replies wait for the owner's OK — AUTONOMY-10 / AUTONOMY-10.a)

## Added

### REQUIREMENT REQ-discord-099

Its first 20 replies in public threads each wait for my OK on an Approve card,
even text I dictated and replies to me (AUTONOMY-10: "It asks before
announcements it starts and before its first 20 replies in public threads;
GitHub comments and social posts don't need asking."; AUTONOMY-10.a: "Every
channel post it makes, and each of its first 20 public-thread replies, waits
for my OK, even text I dictated and replies to me." — both already captured
in `hi/autonomy.md` from Leif's 2026-09-28 interview, round 13 on
2026-09-30; REQ-discord-097 built the channel-post half, this is the replies
half). `src/discord/public-reply-gate.ts` SHALL keep how many held replies
the owner approved in `schema_meta` key `public_thread_replies_approved`
(`approvedPublicReplies`, `countApprovedPublicReply`; a value that cannot be
read counts as 0; no schema version change). While it is under
`PUBLIC_THREAD_REPLY_LIMIT` (20), every post the bridge makes that carries
model text in a public thread SHALL wait for the owner's OK:

- Public thread: a channel whose Discord type is `PUBLIC_THREAD` (11; a
  forum or media channel's posts are public threads) or
  `ANNOUNCEMENT_THREAD` (10) (`isPublicThreadType`), asked of the gateway at
  post time (`GatewayHandlers.isPublicThread`: the live gateway fetches the
  channel). A lookup that fails SHALL count as public (fail closed); with no
  lookup (the dry-run null gateway) nothing is public. A private thread, a
  channel and a DM are not.
- Model text: a chat answer, an ask pick's or Answer form's answer (a Choose
  stub or Answer post included), a question restated after a thin ack, a
  `/session start` or `/work` answer (the topic or description the requester
  typed included) and a schedule's result or question
  (`SchedulerOutbound.post`'s `modelText`). Text the owner dictated, and
  replies to the owner, wait too. Fixed harness text SHALL NOT wait: the
  progress embed, `⏹ Stopped`, a failed run's DISCORD-3.b lines (the
  owner's reason line and the generic lines are harness text,
  REQ-discord-032), the spend-cap "Work is paused for budget." line, ping
  lines that only point at a post, acks, notices and wait notes.
- The hold: `createPublicReplyGate(...).hold` SHALL record a `reply` request
  (class plain) in `approval_requests` — the reply text verbatim (SAFE-6
  scrubbed) as its text, `Discord thread <#id> (id)` as target, `1 reply (N
  characters)` as amount, the requester, the bridge process as waiter, open
  for `PUBLIC_REPLY_CARD_TTL_MS` (5 minutes) — and run a card pass at once.
  The bridge SHALL register `publicReplyApprovalKind({ db })` on its one card
  engine, so the owner gets the text first as quoted data (fence-safe) and
  then the card with Approve / Deny and no one-time code (SAFE-18..20).
  Meanwhile the fixed line `⏳ waiting for the owner's OK before replying
  here` SHALL show where the reply goes: the run's progress message
  (`ThinkingStatus.hold`, its Stop button kept), else the deferred slash
  reply (`holdSlashReply`), else a short note in the thread.
- Approve: the waiting bridge SHALL use the approval once and count it in one
  transaction, then post exactly the text the card showed (the note
  removed). A question the reply asks SHALL be set pending only then (chat,
  ask pick, `/session start`, `/work`), so a reply or a thin ack never
  answers or restates a question nobody can see yet.
- No: a deny, no answer before the card lapses, a stop of the run (the Stop
  button or a stop word ends the wait) or the bridge closing SHALL post none
  of it (SAFE-20): the waiting message becomes `publicReplyNotPostedText(
  outcome)` (`Not posted — the owner didn't OK this reply.`, `Not posted —
  no OK from the owner in time.`, …) or `⏹ Stopped` for a stop, no question
  is left pending, the turn records that line, and nothing counts. With no
  owner configured, or no DB, nothing that waits is posted and no card is
  raised. On the scheduler's poster a deny or lapse SHALL resolve true
  (final: not posted, not retried) and a stop, no owner or no card false
  (an ask is handed back).
- Files: the bridge SHALL stamp each chat, ask, `/session start` and `/work`
  spawn with `AgentRunChatOpts.replyPublicThread` = whether replies in its
  conversation channel still wait; the spawn client SHALL always write
  `CORVIDINHO_DISCORD_REPLY_PUBLIC_THREAD` (`1`, else empty; never
  inherited). With it, while fewer than 20 were approved,
  `discord-send-file`'s `mustAsk` (`sendFileMustAsk`) SHALL raise the
  must-ask gate's plain `mustask-post` card (class `public`) showing the
  caption and `[attachment: <file>]` before anything is attached; no card
  without the stamp, for a dry run, or for a call its handler refuses anyway
  (no file, no acting user, a channel off the allowlist).
- GitHub comments and social posts never ask. No env var, config key, slash
  command, table or schema version is added (the stamp is bridge-to-run
  plumbing).

Acceptance Criteria
- `isPublicThreadType` is true for 11 and 10 only; the count starts at 0, goes up by one per used approval, reads garbage as 0, and stops the waiting at 20; `mustHold` asks the gateway per post (a throwing lookup is public) and not at all once 20 were approved.
- `hold` in a public thread records a plain `reply` card with the text verbatim, posts the hold note, and on Approve removes it and returns exactly the card's text (a secret shown and posted as `[redacted:…]`), counting one; Deny, a lapse, a stop and `close()` return a no and count nothing; with no owner there is no card.
- On the engine the reply goes to the owner first as quoted data (its fences cannot break out, `@everyone` defanged), then a card with Approve / Deny; one owner press approves it, no code.
- A chat answer in a public thread — even the owner's own — waits on its progress message (Stop button kept, nothing of the answer out) and is posted exactly on Approve; a denied one ends as the not-posted line with nothing of it out and the turn recording the line; a held clarify question is pending only after Approve and never after Deny.
- A plain channel, a private thread, or 20 approved: no card, posted at once. A failed run's line, a spend-cap stop and `⏹ Stopped` never wait. The Stop button stops a waiting run: `⏹ Stopped`, nothing posted, the card closed as a no.
- A thin ack's restatement waits behind a note that is removed on Approve (the restatement keeps its Answer button) or becomes the not-posted line on Deny; an ask pick's answer waits on the stub.
- `/session start` and `/work` answers in a public thread wait (the typed topic or description on the card); Deny posts only the not-posted line with no pending question; Approve posts exactly the card's text and sets the question pending; outside a public thread nothing waits.
- The run is stamped `replyPublicThread` true in a waiting public thread and false elsewhere or once 20 were approved; the spawn client writes `1` or empty, never the inherited value; `discord-send-file` asks only with the stamp, under 20, not dry-run, and a denied card attaches nothing.
- A real `task run` against the fake model answering in a public thread waits for the card and then posts exactly its answer.
- `tests/discord.public-reply-gate.test.ts` fails on the base sources (17 of 28) and passes on the branch.

## Modified

### REQUIREMENT REQ-discord-097

Every channel post it makes waits for my OK, even text I dictated and replies
to me (AUTONOMY-10.a, captured with `hi` in this change from Leif's
2026-09-30 round 13 decision; this is the channel-post half — the first-20
public-thread replies half is REQ-discord-099), and every prod card needs the
one-time code (AUTONOMY-9.a). `src/discord/approval-cards.ts` SHALL export
`mustAskApprovalKinds({ db, now? })`: two `storedApprovalKind` kinds over
`approval_requests` — `mustask` (class destructive: Approve, then the SAFE-19
one-time code) and `mustask-post` (class plain: one Approve press) — whose
Approve only records the decision for the waiting run to consume once
(REQ-plugins-097), `nothingDone` "nothing was done", and whose request is
closed as a no when its waiting process is gone. The bridge SHALL register
both on its one engine beside the forget kind, so the cards are DMed to the
owner on the engine's ~5 s poll (with or without the scheduler), the text or
command first as quoted data, and answered by the owner only (SAFE-18..20).
`discord-post-message` SHALL raise the `mustask-post` card for every post
(target `Discord channel <id>`, text exactly the defanged body it posts,
at most 1900 characters) before its DISCORD-8 requester lookup; its channel
gate, requester-flag, token and strict-mode checks (`preparePost`, shared
with the handler) run first, so a post they refuse raises no card, and a
dry run (`CORVIDINHO_DISCORD_DRY_RUN=1`) raises none. No env var, config key
or schema change.

Acceptance Criteria
- `mustAskApprovalKinds` gives `mustask` (destructive) and `mustask-post` (plain); on the engine a prod card's text goes out first as quoted data, Approve alone runs nothing and Approve plus the code runs the waiting call once; a post card needs one press, and Deny runs nothing.
- A real `discord-post-message` post waits for the card and posts exactly the text the card showed; a refused post (channel, requester flag, token, strict) and a dry run raise no card.
- Its first 20 replies in public threads wait on the bridge's own plain `reply` card (REQ-discord-099), registered on the same engine.

### REQUIREMENT REQ-discord-741

A schedule the owner creates runs as the owner; schedules other people create
stay read-only (DISCORD-SCHEDULE-1.a, #124). `SchedulerServiceOpts` SHALL
gain an optional `loadOwner` (`() => Promise<OwnerRecord | null> |
OwnerRecord | null`), read once per run: the bridge SHALL wire it to
`loadOwnerConfig({ env, filePath: <the loaded allowlist's source path> })`
and the daemon to `loadOwnerConfig({ env })` (REQ-cli-741), so a run reads
the owner as configured now; without it the start-time `owner` is used, and a
read that throws SHALL be logged (`[scheduler] owner failed: <scrubbed
line>`) and count as no owner (fail closed).

- `runOne` SHALL, after the DISCORD-SCHEDULE-3 creator / channel gate
  (REQ-discord-020) and before the SAFE-13 scan, resolve the creator's role
  against that live owner (`resolveDiscordActingRole` with the live owner, the
  live mute set and the people list read with that owner; the SAFE-12 fence
  and the answered-ask block use the same owner) and spawn the run with
  `actingIsAdmin: true` only when that role is `owner` and
  `isOwnerDiscord(liveOwner, schedule.createdByUserId)` — the owner as
  configured now, not muted or deny-listed. Every other schedule SHALL be
  spawned with `actingIsAdmin: false`. No schedule SHALL pass `actingRole`,
  so the spawn client stamps `owner` or `community`, never `team`.
- The run keeps `surface: "schedule"` and its `schedule_<id>` session id, so
  the SAFE-3.a gate still refuses the shell, runners and Fledge runs
  (REQ-agent-503), no Fledge plugin command is discovered (REQ-agent-741), the
  repo gate stays on (DISCORD-SCHEDULE-3.a) and the tool layer re-checks the
  owner at every call (REQ-plugins-065). The owner's schedule is offered the
  dangerous tools the allowlist names; a must-ask call it starts (a
  `discord-post-message` included) raises the owner's Approve card through
  `runPlugin`. A deny, a lapse or a resent deny ends the run with the stuck
  ask `mustAskRefusedAsk` builds (REQ-agent-741); `finish` records it and it
  blocks the schedule (AUTONOMY-6.a, REQ-discord-606): it is posted once to
  the schedule's channel (the owner pinged, with its Answer and Cancel
  controls), and each later due run is skipped with one wait note, raising no
  new card, until it is answered or cancelled.
- The schedule's own posts (its result, its ask, its wait note) SHALL keep
  going out through the scheduler's outbound, never through `runPlugin`, so
  they are not AUTONOMY-10 announcements it starts and need no must-ask card.
- The scheduler SHALL mark a result post and an ask post that carry model
  text `modelText` (never the `❌` line, a spend-cap stop or the wait note),
  and in a public thread, while fewer than 20 replies were approved, the
  bridge's poster SHALL hold them for the owner's `reply` card like any
  public-thread reply (AUTONOMY-10.a, REQ-discord-099): a deny or lapse is
  final (not posted, not retried), a stop hands an ask back.
- An owner schedule on a non-git project SHALL keep its own scoped folder
  (`scoped-talk-schedule_…`), never the project folder itself.
- No new env var, config key, slash option, table, column or schema version.

Acceptance Criteria
- `tests/scheduler.owner-role.test.ts`: the owner's due schedule is spawned `actingIsAdmin: true` with no `actingRole`, surface `schedule`, session `schedule_<id>` and its prompt unfenced, and its result post goes straight to its channel; a declared team member's and a stranger's are spawned `actingIsAdmin: false` with no `actingRole`.
- Same file: started with one owner while `loadOwner` names another, the old owner's schedule is community (fenced `role: community`) and the new owner's runs as the owner, one read per run; `loadOwner` returning null, throwing (logged) or a muted owner give `false`; without `loadOwner` the start-time owner is used.
- Same file: an owner schedule on a non-git project runs in its own `scoped-talk-schedule_…` folder, never the project folder.
- Same file: through the real spawn client, the child of the owner's schedule resolves `owner` (stamps `1` / `owner` / `schedule`, the shell gate refusing "scheduled runs never get them") and a team member's resolves `community`.
- Same file: in process, the owner's schedule's `discord-post-message` raises one `mustask-post` card; denied, the scheduler records the stuck ask naming it, posts it once pinging the owner with its controls, and the next two due ticks run nothing, raise no new card and post one wait note.
- Same file: `startDaemon` and `startBridge` spawn the owner's schedule as the owner, and after the allowlist file names another owner the next run of it is community.
- With the base sources these tests fail; the read-only, owner-chat and other-person guards pass on both.
- `tests/discord.public-reply-gate.test.ts` ("a schedule's posts"): the result and the question are posted with `modelText: true`, the `❌` line without it; on the bridge a schedule's result in a public thread waits for the `reply` card, a denied one is not posted or retried and the next approved one goes out (REQ-discord-099).
