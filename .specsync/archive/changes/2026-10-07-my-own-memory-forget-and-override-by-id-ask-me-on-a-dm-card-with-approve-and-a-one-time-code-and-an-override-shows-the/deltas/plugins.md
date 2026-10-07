---
module: plugins
change: my-own-memory-forget-and-override-by-id-ask-me-on-a-dm-card-with-approve-and-a-one-time-code-and-an-override-shows-the
---

# Delta: plugins (the owner's memory forget / override by id ask on a DM card — SAFE-18.a)

## Added

### REQUIREMENT REQ-plugins-183

My own memory forget and override by id ask me on a DM card with Approve and
a one-time code, and an override shows the new text word for word
(SAFE-18.a, captured in this change's PR from Leif's 2026-09-28 interview,
round 17, under SAFE-18; SAFE-4, SAFE-19 and SAFE-20 stay binding). The card
is SAFE-4's two-phase confirm for `memory-forget` and `memory-override`;
there is no typed confirm token any more.

- After the argv identity refusal, `memory-forget` / `memory-override`
  SHALL refuse at once, with one line saying only the running Discord bridge
  delivers the card and there is no typed-token fallback, when the run has no
  role session (the local CLI). Then, as before: no acting Discord user ⇒
  refused (MEMORY-ACL-1); a missing id (or override text) ⇒ usage; not the
  owner ⇒ the opaque `not authorized` (REQ-plugins-011). For the owner,
  `--confirm` in any form in flag position SHALL be refused (no card, no
  change) with a line saying there are no confirm tokens; a run that is not
  a conversation with the owner (no `CORVIDINHO_DISCORD_REPLY_CHANNEL_ID`:
  a schedule, any other run) SHALL refuse with the bridge line. None of these
  raises a card or changes anything.
- Otherwise the handler SHALL look the memory up (missing or already
  forgotten ⇒ `memory not found`, no card) and call `askMemoryCard`
  (`src/memory/card.ts`): one `memory` request on the shared approvals
  store (`approval_requests`, no schema bump), class `destructive`, with
  title `Forget|Override a memory by id (SAFE-18.a) · from <surface>`, the
  exact action (`memory-forget: forget this memory …` /
  `memory-override: replace this memory's text with the text above, word for
  word`), the target `memory <id> — <category>/<key>, owner scope <scope>,
  last changed <ISO time>`, the amount `1 memory (no money)`, and for an
  override the new text as the card's text (SAFE-6 scrubbed as recorded —
  the same scrub the memory store applies when it writes, so the card shows
  exactly what would be stored), requester the acting owner and waiter this
  process; then wait (`MEMORY_CARD_TTL_MS`, 5 minutes; the run's abort
  signal stops the wait).
- Only an approval this run uses once (`ApprovalStore.consume`; Approve plus
  the right one-time code on the card, REQ-discord-183) SHALL let the change
  run, and only when the actor is still the owner and, inside one IMMEDIATE
  transaction, the memory is still the same row, not forgotten and not
  changed since the card (`updated_at` equal); else nothing changes and the
  refusal says the memory changed after the card. A denied card, no answer
  by its expiry (or a card the engine closed because the waiting run was
  gone), and a stopped run (exit 130; the stop wins over an approval) SHALL
  change nothing, with a refusal naming the card (SAFE-20); `data` carries
  `refused`, `op`, `id`, `outcome` and `request`.
- On success the reply SHALL keep the audit-friendly line
  `forgot|overrode memory <id> (<category>/<key>, owner <scope>) by <actor>`
  plus the card id, and `data` the op, target, actor, time and request id;
  never the memory's content. The SAFE-5 rows of the dangerous tool run
  (`runPlugin`) and of the card (REQ-discord-183) stay.
- Anyone else's flows are unchanged: non-owners are refused before any card
  (role gate or the handler's opaque refusal), and `memory-forget-me`
  (MEMORY-ACL-6) keeps its own `forget` card. The tool descriptions and the
  memory argv hint (`src/agent/tools.ts`) SHALL describe the card, the code
  and the wait, and no longer mention `--confirm`.

Acceptance Criteria
- The owner's forget in a Discord conversation raises one destructive `memory` card with the exact action, target and amount; Approve alone changes nothing; Approve + the code forgets it once (request `used`).
- An override's card text is the new text word for word (scrubbed as stored); Approve + code stores exactly it.
- Deny, no answer, a late press, a gone waiter or a stopped run changes nothing; a memory changed after the card is not changed even with the right code.
- The local CLI and a schedule run refuse with the bridge line and raise no card; `--confirm` is refused with no card.
- Non-owners are refused as before with no card; `memory-forget-me` still records its forget request.
- The fake model's `memory-forget` call waits for the card and succeeds once approved; the hint names no `--confirm`.

## Modified

### REQUIREMENT REQ-plugins-010

Corvidinho SHALL register memory plugins `memory-store`, `memory-recall`,
`memory-forget`, and `memory-override` (PLUGIN-1 memory surface) backed by
shared-store `MemoryStore` (REQ-discord-021).

`memory-store` / `memory-recall` are safe and act only in the acting user's
own scope. `memory-forget` / `memory-override` are dangerous (SAFE-1) and
SHALL require the two-phase confirm — since SAFE-18.a the owner's Approve
plus the one-time code on a DM card (REQ-plugins-183), with no typed confirm
token — plus ADMIN re-checked at handler time (REQ-plugins-011,
MEMORY-ACL-3/4). Acting Discord user id and ADMIN come only from bridge-set
env (`CORVIDINHO_ACTING_DISCORD_USER_ID`, `CORVIDINHO_ACTING_IS_ADMIN`)
checked against the live admin config — never from argv.

Acceptance Criteria
- `plugins list` shows the four memory commands with danger markings.
- Store/recall work for the env acting user's scope without admin.
- Forget/override without the owner's approved DM card (Approve plus the one-time code) or without admin refuse.
- Non-admin cross-user forget refuses without leaking content.
- Builtins load memory plugins; fixture tests without live Discord.

### REQUIREMENT REQ-plugins-011

Memory plugins SHALL take the acting user and ADMIN status only from the
environment the Discord bridge sets per spawn, never from argv (argv is
model-controlled in the tool loop). `--user`, `--admin`, and `--db`
(including `--flag=value` forms) SHALL be refused. A missing
`CORVIDINHO_ACTING_DISCORD_USER_ID` SHALL refuse (MEMORY-ACL-1).

ADMIN for `memory-forget`, `memory-override`, and `memory-recall
--include-deleted` SHALL be re-checked inside the handler at call time
(ADMIN-4 / DISCORD-7). The bridge's per-dispatch
`CORVIDINHO_ACTING_IS_ADMIN=1` is required on every path (a scheduled run
spawned with it off never gets ADMIN), and the live config must agree: ADMIN
is owner-only (IDENTITY-2) — the acting user must be the configured owner;
no owner ⇒ nobody is ADMIN even when `CORVIDINHO_ACTING_IS_ADMIN=1`
(IDENTITY-3 / MEMORY-ACL-4); `CORVIDINHO_DISCORD_ADMIN_USERS` / `_ROLES`
never grant ADMIN; deny-listed or muted users are never ADMIN. Self-forget
stays ADMIN-only.
Refusals stay opaque and never include memory content (MEMORY-ACL-2).

Forget and override SHALL be two-phase (SAFE-4): since SAFE-18.a
(REQ-plugins-183) the second phase is the owner's Approve plus the one-time
code on a DM card that shows the exact action, target and, for an override,
the new text; the call waits for it and changes the memory only on an
approval it uses once, while the memory is still what the card showed. The
typed HMAC confirm token (`src/memory/confirm.ts`, `--confirm <token>`,
`CORVIDINHO_ACTING_CONFIRM_TOKENS`) is gone: `--confirm` SHALL be refused,
and a token in the env or the human's message SHALL count for nothing. With
no bridge conversation to deliver the card (the local CLI, a schedule) the
call SHALL refuse; there is no token fallback.

Acceptance Criteria
- `--user` / `--admin` / `--db` refused on all memory commands.
- No acting user env ⇒ refused; other actors never see a user's memories.
- No owner + `CORVIDINHO_ACTING_IS_ADMIN=1` ⇒ forget/override refused.
- Owner id without the bridge bit (scheduled runs) refused; deny-listed or muted owner refused; admin user/role lists + env bit refused.
- The owner's forget / override asks on the DM card and changes the memory only once approved with the code; Deny or no answer changes nothing; no token or content in the result.
- `--confirm` (`--confirm X`, `--confirm=X`, bare) is refused with no card; a token in the env changes nothing.
- `--include-deleted` refused for non-admins; `--include-deleted=false` is off.
- `--user` / `--admin` / `--db` are only refused in flag position; text after `--` or in `--content=` is data (`--confirm` after `--` is override text too).
