---
module: plugins
change: person-and-project-memory-private-notes-and-forget-me-on-an-owner-approve-deny-card-each-declared-person-keeps-one
---

# Delta — plugins (memory profiles, project memory, privacy, forget-me)

## Added

### REQUIREMENT REQ-plugins-101

Memory plugins by person and project, private to the person and the owner
(MEMORY-5..7, MEMORY-ACL-6, #101). Whose memory a call reads and writes SHALL
be the acting Discord id (bridge env only, REQ-plugins-011) matched in the
owner's people list re-read at the call (`loadPeopleForMemory`,
`memorySubjectFor`): a declared person's `person:<id>` profile (reading
also the rows under their linked Discord ids from before they were
declared), else the Discord id as before (MEMORY-ACL-1). `memory-store`
SHALL accept the profile categories `project`, `preference`,
`decision`, `ask`, `approval` (MEMORY-5) and `private` (MEMORY-7), and
SHALL refuse `--person` (it writes only the acting person's own memory).
`memory-profile` (safe, minTier 0) SHALL show the subject's role from the
people list (IDENTITY-8; never from memory), projects, preferences, a history
of decisions, asks and approvals newest first, and counts of private and
other notes — never private note content.

`memory-recall` / `memory-profile` SHALL read someone else's memory only
with `--person <declared id | Discord id | mention>` when the handler-time
ADMIN re-check passes (the owner with the bridge bit, not muted or
deny-listed); anyone else naming anyone but themselves SHALL get the opaque
`not authorized` whether or not that person exists (MEMORY-7 /
MEMORY-ACL-2). A recall SHALL leave private notes out unless `--category
private` is asked for, and then SHALL return them only in a conversation
(`CORVIDINHO_DISCORD_REPLY_CHANNEL_ID` set by the bridge; never a schedule
or other run), labelled for that person and the owner only.

`--project` on `memory-store` / `memory-recall` SHALL use the run's
project scope (`projectScopeFor(cwd)`, REQ-discord-101) and SHALL be allowed
only when `resolveActingRole` is owner, team or null (the local CLI);
community (undeclared, declared community, WATCH, schedules, workers) SHALL
get the role refusal (exit 2); a project SHALL have no private notes, and
`--project` SHALL NOT combine with `--person`.

`memory-forget-me` (safe, minTier 0, not mutating, so every role may call
it) SHALL take no arguments and record a forget request for the acting
subject (`ForgetRequestStore.request`, one pending per subject; a repeat
returns the open one) with the conversation it came from; it SHALL refuse
with no acting user, outside a conversation, and when no owner is configured
(IDENTITY-3); it SHALL write SAFE-5 `memory-forget-request` rows (`started`
first, refusing when that cannot be written, then `ok` / `error`) and SHALL
delete nothing: forgetting happens only on the owner's Approve
(REQ-discord-101). `memory-forget` / `memory-override` (owner, two-phase)
are unchanged.

Acceptance Criteria
- A declared person's `memory-store` lands in `person:<id>` and every linked Discord id recalls it; rows under their Discord ids from before are read once; an undeclared user's scope is their Discord id.
- `memory-profile` shows the people list's role (a file edit changes it), projects, preferences, history newest first and a private-note count without content.
- A non-owner's `--person` (any ref, known or not) and `memory-profile --person` get `not authorized`; the owner with the bridge bit reads a person's memory and private notes; without the bit or muted, refused.
- Private notes are left out of default and query recalls, returned on `--category private` for that person or the owner in a conversation, refused in a schedule run; `memory-store --person` is refused.
- `--project` works for owner, team and the local CLI and is refused for community, undeclared and a community-stamped team member; `--project --category private` and `--project --person` are refused.
- `memory-forget-me` records one pending ask per person (audited), deletes nothing, and refuses with no actor, outside a conversation, with arguments, and with no owner.
- `tests/memory.profiles.test.ts` and `tests/discord.forget-card.test.ts` cover each and fail on the stacked base sources.

## Modified

### REQUIREMENT REQ-plugins-010

Corvidinho SHALL register memory plugins `memory-store`, `memory-recall`,
`memory-forget`, and `memory-override` (PLUGIN-1 memory surface) backed by
shared-store `MemoryStore` (REQ-discord-021), plus `memory-profile` and
`memory-forget-me` (REQ-plugins-101).

`memory-store` / `memory-recall` are safe and act only in the acting user's
own scope (a declared person's profile; `--project` for the run's repo; the
owner's `--person` read, REQ-plugins-101). `memory-forget` / `memory-override` are dangerous (SAFE-1) and
SHALL require the two-phase confirm token plus ADMIN re-checked at handler
time (REQ-plugins-011, MEMORY-ACL-3/4). Acting Discord user id and ADMIN come
only from bridge-set env (`CORVIDINHO_ACTING_DISCORD_USER_ID`,
`CORVIDINHO_ACTING_IS_ADMIN`) checked against the live admin config — never
from argv.

Acceptance Criteria
- `plugins list` shows the four memory commands with danger markings.
- Store/recall work for the env acting user's scope without admin.
- Forget/override without a valid confirm token or without admin refuse.
- Non-admin cross-user forget refuses without leaking content.
- Builtins load memory plugins; fixture tests without live Discord.
- `memory-profile` and `memory-forget-me` are registered as safe (not dangerous, not mutating).
