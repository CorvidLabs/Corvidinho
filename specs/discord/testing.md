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

## Slash answer reply continuity (REQ-discord-002, DISCORD-2 / SESSION-MULTI-1)

- `tests/discord.slash-reply-continuity.test.ts` — through `startBridge` with a
  fake gateway: after `/session start` (or `/work`) A then B, the owner's reply
  to A's answer resumes session A with the reply ping on and off; a fallback
  answer (no collapse, deferred reply id from `editReply`) is tracked too;
  a member's `/work` A/B works the same, and another user's reply (even the
  configured owner's) never resumes A; a throwing tracking write still lets
  the answer collapse and the deferred reply be deleted (no live Discord).
