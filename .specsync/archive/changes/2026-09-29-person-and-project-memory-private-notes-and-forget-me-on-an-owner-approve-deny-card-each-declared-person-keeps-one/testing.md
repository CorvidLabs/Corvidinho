---
change: person-and-project-memory-private-notes-and-forget-me-on-an-owner-approve-deny-card-each-declared-person-keeps-one
artifact: testing
---

# Testing

Fixture tests only: temp allowlist / people files, a temp data dir, temp git
repos with a worktree, `runPlugin` with bridge-shaped env, `startBridge` with
a null gateway whose `reply` / `sendDm` / `editMessage` record calls, and a
fake clock for expiry; no live Discord, no token, no network.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-101` | `tests/memory.profiles.test.ts` ("MEMORY-5: one profile per declared person …") | A declared person's store lands in `person:tofu` and their second Discord id recalls it; a row under their Discord id from before is read, a newer profile row of the same key wins with no duplicate; rows under a Discord id declared for two people join neither profile; an undeclared user's row is under their Discord id and another user never sees it; `memory-profile` shows role team, projects, preferences, history approval → ask → decision, `private notes: 1` without content; a people-list edit changes the role; an undeclared profile says so. |
| `REQ-plugins-101` | `tests/memory.profiles.test.ts` ("MEMORY-7: …") | Community, undeclared and team callers get `not authorized` for `--person` by id, Discord id, mention and an unknown id (with and without `--category private`) and for `memory-profile --person`; the owner with the bridge bit reads Tofu's memory, private notes and profile, `no such person` for an unknown id, and is refused without the bit or when muted; private notes are left out of default and query recalls, returned on `--category private` with the never-repeat label in a conversation, refused in a schedule run; `memory-store --person` refused. |
| `REQ-plugins-101` / `REQ-discord-101` | `tests/memory.profiles.test.ts` ("MEMORY-6: …") | `projectKeyFor` gives `corvidlabs/demo` for a checkout with a credentialed origin and for its worktree, the main checkout path once origin is removed, the folder for a plain folder; the owner stores `--project` (no `ghp_` in the row), team reads it from the worktree and writes to it; community, undeclared and a community-stamped team member get the role refusal on store and recall; the local CLI reads it; `--project --category private` and `--project --person` refused. |
| `REQ-discord-101` | `tests/memory.profiles.test.ts` ("Discord inject …") | `memoryInjectOptsFor` + `enrichPromptWithMemories`: Tofu (via the alt id) gets their profile and legacy rows, never private notes or Kyn's, plus the project block as team; Kyn (community) gets only theirs; the owner gets the project block; `enrichPromptWithProjectMemory` is unchanged for an empty project. Through `startBridge` each speaker's prompt holds only their own profile, no private notes, the project block for owner / team only. |
| `REQ-plugins-101` | `tests/discord.forget-card.test.ts` ("memory-forget-me …") | A community member, an undeclared user and a declared person (alt id) each record one pending ask (a repeat returns the same id), `forget_requests` rows as expected, nothing deleted, `memory-forget-request` started / ok rows; refused with no actor, outside a conversation, with arguments (`--person`, positional, `--user`) and with no owner configured, recording nothing. |
| `REQ-discord-101` | `tests/discord.forget-card.test.ts` ("approve-card helper …") | `cvok:forget:approve:<id>` round-trips, junk ids parse to null, an unsafe id throws, Approve style 4 / Deny style 2, expiry boundary, card text and decided text. |
| `REQ-discord-101` | `tests/discord.forget-card.test.ts` ("the owner approves on a DM card …") | `deliverForgetCards` DMs the owner one card (who, role, asker, 5 stored, request id, lapse; no memory content), a second pass sends none; the asker's and a stranger's presses get the ephemeral refusal with `denied` rows; the owner's Approve deletes all six of Tofu's rows (profile, private, superseded, legacy, alt) and Tofu's session turn, keeps Kyn's, the stranger's and project rows, Kyn's turn and the people file, writes `started` / `ok`, updates the card with no buttons and DMs Tofu; a second press says already closed. Deny deletes nothing and, the DM failing, posts in the allowlisted conversation mentioning only Kyn. The chat path sends the card after the message. With a keyed chain and no key, Approve is refused, nothing deleted, the ask stays pending. |
| `REQ-discord-101` | `tests/discord.forget-card.test.ts` ("no answer, or a late answer, is no") | With a fake clock: two cards posted; after 24 h a late Approve closes Tofu's ask `expired`, the pass expires Kyn's, edits the card (no buttons), both askers are told, nothing is deleted; a new ask after expiry is created. |
| `REQ-discord-101` / `REQ-discord-021` | `tests/discord.forget-card.test.ts` ("schema v12 …"), `tests/watch.session-store.durable.test.ts`, `tests/scheduler.ask-outbox.test.ts` | `SCHEMA_VERSION` 12; a v11 DB migrates keeping its memories; `forget_requests` columns, no free-text column, a second pending ask for the same subject is refused by the index; re-running is a no-op; the two schema tests expect 12. |
| `REQ-discord-021` / `REQ-plugins-010` | `tests/memory.store.test.ts`, `tests/memory.plugins.test.ts`, `tests/discord.memory-inject.test.ts`, `tests/roles.team.test.ts` (unchanged) | The four HI categories, per-user ACL, two-phase forget / override, the inject format and team memory stay green. |
| `REQ-agent-101` | `tests/memory.profiles.test.ts` ("the tool-loop prompt names the rules") | `MEMORY_AGENT_SYSTEM_INSTRUCTIONS` names the profile categories, `memory-profile`, `memory-recall --project` / `memory-store --project`, the one-person-never-about-another rule, private notes never injected and `memory-forget-me` until the owner approves on a card; `tests/discord.memory-inject.test.ts` keeps the REQ-agent-010 phrases. |

Fail on base: with the stacked base (89f7976) checked out and the two new
test files copied in, `tests/discord.forget-card.test.ts` fails to load
(`src/discord/approve-card.ts` missing) and `tests/memory.profiles.test.ts`
fails 13 of 16 (three tests that also hold on base pass there by design:
an undeclared user's Discord-id scope, re-storing a key, and a Discord id
declared for two people joining neither profile). A
behavioural copy importing only base exports (schema v12, `memory-forget-me`
records an ask, the bridge DMs a card whose Approve forgets, a declared
person's `person:<id>` row, the owner's `--person` read, private notes left
out of a default recall) fails 6 of 6 on base and passes 6 of 6 on the branch.

Full suite: `bun test` green; `bunx tsc --noEmit` clean; `specsync check
--require-coverage 100` 100%; `hi check` green; `fledge lanes run verify
--non-interactive` completed.
