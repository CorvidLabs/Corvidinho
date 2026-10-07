---
module: discord
change: every-working-day-the-owner-and-each-teammate-get-a-short-briefing-dm-about-their-own-work-in-their-own-hours-and
---

# Delta: discord (daily briefing DMs on the scheduler tick; per-person time zone and working hours in the declared people list — COS-1, COS-2, COS-2.a)

## Added

### REQUIREMENT REQ-discord-102

COS-1 ("Every working day it DMs me and each teammate a short briefing: what
changed, what's blocked, what needs us, and what it did for us."), COS-2
("Each briefing is about that person — their projects, their asks, their
reviews — and arrives in their own working hours and timezone.") and COS-2.a
("Each person's working hours and timezone come from the declared people
list; without them, it uses my timezone and 9am."), captured in this
change's PR from Leif's 2026-09-28 interview record (round 17, 2026-10-07),
SHALL be met by `src/scheduler/briefing.ts`, run from the existing scheduler
tick of the Discord bridge.

- Who. `briefingRecipients({ people, owner, allowlist, mutedUsers })` SHALL
  return the owner's person (the DM going to the configured owner's Discord
  id) and each declared person whose role is team (IDENTITY-8 / IDENTITY-10;
  the DM going to their first declared Discord id), and only when that
  Discord id resolves to them through `resolvePerson` (stable ids only).
  Community and undeclared people, a person with any Discord id on
  `[discord].deny_users` or in the bridge's mute set (DISCORD-6), and an id
  declared for two people (IDENTITY-7) SHALL get none; with no owner
  configured nobody SHALL (IDENTITY-3).
- When (COS-2.a). `briefingHoursFor(person, ownerEntry)` SHALL take the
  person's `timezone`, else the `timezone` on the owner's declared person
  (the entry holding the owner's Discord id), else UTC; and their
  `working_hours`, else 09:00 with the window closing at 17:00.
  `briefingSlot(now, hours)` SHALL read the local clock of that zone: a
  working day is Monday to Friday there; a briefing MAY be claimed only from
  the start of their hours until they end, on a working day; a DM not out by
  the end (or still waiting from an earlier day) SHALL be dropped
  (`expired`, text cleared) and never sent outside their hours.
- Once a day. `cos_briefings` (this module's own table, `CREATE TABLE IF NOT
  EXISTS`, no schema version) SHALL hold one row per person id.
  `claimBriefingDay` SHALL claim their local day in an IMMEDIATE transaction
  before anything is read, so a person never gets two in a day (also across
  two tickers on one data dir). The same day SHALL be claimed again only for
  a `failed` model call or a `composing` row a dead process left, 30 minutes
  after the last claim and at most 3 times a day; a local day earlier than
  the row's (their time zone moved west) SHALL never be claimed, so a zone
  change never opens a second briefing in one day. A `sending` row (a DM
  attempt started) SHALL never be sent again; a `sent`, `skipped`, `budget`
  or `expired` day SHALL never be claimed again.
- What (COS-2; that person only, MEMORY-ACL). `readLocalBriefingFacts` SHALL
  read, by the person's declared Discord ids only: their `/work` tasks that
  stopped to ask since the last briefing (`blocked` with `updated_at` since
  then; what's blocked — the row keeps `blocked` after the ask is answered
  or lapses, so an older one SHALL NOT be repeated); their schedules' open
  blocking questions
  (`ask_blocking = 1`, not closed; what needs them); their `/work` tasks and
  schedule runs that ended `completed` / `failed` since the last briefing
  (what it did for them); and for the owner only, the number of pending,
  unexpired Approve cards per kind (never their titles or text).
  `readGithubBriefingFacts` SHALL, only for a person with a GitHub numeric id
  and login and only when the GitHub allowlist has repo entries, search by
  login (`is:pr author:`, `is:issue author:` and `is:issue assignee:` updated
  since the last briefing; `is:pr is:open review-requested:`) and keep only
  items in repos `isRepoAllowed` passes (deny wins) whose author, assignee or
  requested reviewer (`pulls.listRequestedReviewers`, at most 10 checks)
  carries one of their numeric ids (IDENTITY-7.a: the login is only the
  search term). A failed GitHub read SHALL leave its part out and be logged.
  Since SHALL be the last sent or skipped briefing's `covered_to`, else 24 h
  back, never more than 7 days. No memory rows, private notes or anyone
  else's runs SHALL be read.
- Nothing to say. All four parts empty ⇒ the day SHALL be `skipped`, with no
  model call and no DM.
- Written. `createBriefingComposer` SHALL make one no-tools `chatCompletions`
  call (REQ-agent-102) on the read tier's chain (`modelChain(env, "read")`,
  AGENT-11 fallbacks): system = the persona block (PERSONA-2), then
  `BRIEFING_SYSTEM_INSTRUCTIONS`, the PERSONA-3 rules and the SAFE-12
  instructions; user = the person's display name, local date and zone and
  the facts inside `fenceUntrustedData` (SAFE-12). The fetch SHALL go
  through `createSpendGuard` over the shared ledger (SAFE-8 / SAFE-14,
  AUTONOMY-8.a worst-case reserve, 80% warnings recorded and DMed to the
  owner by the bridge's next spend DM pass, SAFE-15). A cap stop SHALL
  return `spend-cap` with its ask and raise no card; the ticker SHALL mark
  the day `budget` and hand the stop to `onSpendStop` at most once per day
  (the bridge: the owner's spend DM, SAFE-14.a). A failed call SHALL mark it
  `failed`. The reply SHALL be `scrubSecrets`-ed (SAFE-6), `@everyone` /
  `@here` defanged and cut to 1700 characters, and held (scrubbed;
  `cos_briefings.text` is in `SCRUB_TARGETS`) only until it is sent.
- Sent (DM only). Through the gateway's `sendDm` only, as `📋 Your briefing
  for <Weekday> <YYYY-MM-DD> (only you get this)` then the text; never a
  channel post. With no DM path nothing SHALL be claimed or written. A DM
  that does not go out SHALL be retried at most every 15 minutes within
  their hours, logged once per person and day. Log lines carry person ids
  and days, never the text.
- Wiring. `SchedulerServiceOpts.briefings` (`tick(now)`) SHALL be called on
  every tick after the backup with the tick's clock (`schedulesEnabled` does
  not gate the call). One pass runs at a time. The ticker SHALL read
  `BriefingTickerOptions.enabled` (PLUGIN-5 / PLUGIN-5.a; the bridge: the
  `[corvidinho.plugins] schedule` switch of REQ-discord-157, re-read each
  pass) at the start of every pass: off, or a throw, ⇒ the pass SHALL claim,
  write and send nothing (a written DM still waiting expires once its day
  is over); back on, the next one due goes out. The bridge SHALL
  build the ticker over its DB with the declared people re-read each pass,
  `config.owner`, its mute set, the gateway `sendDm`, the composer and the
  Octokit GitHub reads (`GITHUB_TOKEN` / `GH_TOKEN`), not in a dry run
  unless `StartBridgeOptions.briefings` seams are given (`false` turns it
  off); `stop()` SHALL stop it, abort a model call in flight and wait at
  most 3 s. `corvidinho daemon` SHALL NOT send briefings. No new env var,
  config key, slash command or schema version.

Acceptance Criteria
- Tofu (team; `Europe/Oslo`, `08:30-16:30`) gets nothing at 08:25 Oslo and exactly one DM at 08:35 on a Wednesday, to Tofu's Discord id, `📋 Your briefing for Wednesday 2026-10-07 (only you get this)` plus the model's text; the one model call goes to the read tier's `/chat/completions` with no tools, the persona rules and the briefing instructions, and its fenced facts hold Tofu's PR, assigned issue, blocked task, review request, schedule question, finished task and schedule runs — never Bob's task, an old task, an off-allowlist or denied repo, an item whose author or reviewer id is not Tofu's, or the owner's Approve cards (`tests/cos.briefing.test.ts`).
- Later ticks the same day, and a second ticker on the same DB, send nothing more; Thursday sends one more covering only what is new (the open schedule question, not the task that stopped to ask on Wednesday nor the finished one); Saturday and Sunday send nothing.
- A `/work` task that stopped to ask two hours earlier is told once ("/work task stopped to ask a question: …"); the next two days, with its row still `blocked` and nothing new, are `skipped` with no model call; one that stopped three days before the first briefing is never told.
- With `enabled` false nothing is claimed, called or sent; back on, the day's briefing goes out; a throwing `enabled` counts as off. Through `startBridge` with `[corvidinho.plugins] schedule = false` in the allowlist file, ten ticks send nothing and claim nothing; rewriting the file sends the day's DM without a restart.
- Tofu briefed on Thursday 2026-10-08 in Auckland and then moved to Los Angeles (Wednesday 2026-10-07 there) gets no second DM; Friday in Los Angeles gets the next one; the claim refuses an earlier day.
- Through `startBridge` with a $0.05 cap and a reply reported at 300k prompt tokens, the owner gets one `Spend warning (SAFE-8)` DM next to Tofu's briefing.
- Bob (team, no zone or hours) and the owner (`America/New_York`) get theirs at 09:05 New York, not at 08:55; Bob's facts hold only Bob's; the owner's hold `1 forget Approve card waiting in your DMs` and never the card's title; with no zone on the owner's entry Bob's comes at 09:05 UTC.
- Nothing to say: no model call, no DM, the day `skipped`.
- A reply holding a GitHub token and `@everyone` is stored and sent with `[redacted:github-token]` and `@everyone` defanged (a zero-width space after the `@`); the stored text is dropped once sent.
- A DM that does not go out is retried after the 15-minute wait, logged once, and expires at the end of the person's hours with no model call again that day.
- With a spend cap of 0 no model call is made, nothing is sent, both rows are `budget`, and the spend stop is handed over once.
- A failed model call is retried 30 minutes later and then sent; the claim allows at most 3 attempts and never reclaims a sent day; the next day starts where the last one looked.
- No DM path: nothing claimed or written. No owner: nobody. Deny-listed, muted, community and clashing ids: nobody.
- `SchedulerService.tick` hands the briefings its clock on every tick, also with `schedulesEnabled` false (the ticker reads the switch itself); through `startBridge` (dry run with seams, file DB, owner + team in the allowlist file) the DM goes out once through the gateway's `sendDm` and nothing is posted to a channel.

## Modified

### REQUIREMENT REQ-discord-036

Declared people (IDENTITY-13, #36). The owner SHALL declare who's who as
`[people.<id>]` sections of the allowlist file (a `people` object in a JSON
file) with `display`, `nicknames`, `discord_ids`, `github_logins` and
`github_ids` (singular spellings read too; one-line values), and optionally
`timezone` (an IANA time zone name, stored in its canonical spelling) and
`working_hours` (`HH:MM-HH:MM`, 24 h, start before end within one day) for
the daily briefing (COS-2.a, REQ-discord-102); neither ever matches anyone. The person id
SHALL be 1–32 lowercase letters, digits, `-` or `_`; `owner` is reserved.
People SHALL be read from the allowlist file this process loaded (the file
`[owner]` comes from, `AllowlistConfig.sourcePath`), re-read on every use, so
a VM edit or an `/admin people` change applies on the next message, slash run
or WATCH event without a restart; no file loaded means nobody declared. There
SHALL be no second store, env var, config key, table or column (the one later
key, the owner's `[owner] github_id`, is REQ-discord-367; the optional
`timezone` / `working_hours` person keys are REQ-discord-102), and the
allowlist loader and `[owner]` reader SHALL read a file with people sections
exactly as before.

Fail closed: an entry with any unreadable value (bad Discord snowflake,
GitHub login or numeric id, a list spanning lines, a JSON number for a
Discord id, a duplicate section, a `timezone` that is not one IANA zone
name, `working_hours` that are not one `HH:MM-HH:MM` with start before end) SHALL be skipped whole and reported as a
plain-language problem naming the person id and key, never an account id.

`resolvePerson(directory, { discordId, githubLogin, githubId })` SHALL be the
one resolver (for later slices too) and SHALL return `{ personId,
displayName?, role?, person }` or null. It SHALL match only on stable ids —
the Discord user id (or `<@id>`) and the GitHub numeric id — and never on a
display name, nickname or GitHub login (IDENTITY-7; on GitHub the numeric id
only, IDENTITY-7.a, REQ-discord-367: `githubLogin` is accepted and ignored,
so a renamed or re-registered login never counts as anyone); ids that point
at two different people, and an id declared for two people, SHALL match
nobody. The configured owner (IDENTITY-1) SHALL always be a person: the
declared entry holding the owner's Discord id (the owner's `[owner]` GitHub
id and login added to it), else a built-in `owner` entry from `[owner]` /
env; its `role` SHALL be `owner`. No other role is read
yet (#65 adds roles). No AlgoChat or wallet ids.

Recognised on Discord (IDENTITY-14): every interactive run (chat message,
ask button pick resume, `/session start`, `/work`) SHALL add to the
IDENTITY-4 acting-user block, for a declared acting user,
`declared_person: <id>`, the declared `display_name` (winning over the
Discord names), `nicknames` and `github` logins, matched on the acting
Discord user id only. Once anyone is declared, an undeclared non-owner SHALL
be marked `declared_person: none`, so a Discord display name never passes for
a declared person. An owner who is not declared under `[people]` keeps the
block exactly as before, and with nobody declared the block SHALL be
unchanged. The one exception is SAFE-11 (REQ-discord-071): the
Discord display name / username shown is cleaned first (`cleanDisplayName`),
and a non-owner whose shown Discord name reads like the owner's display or
another declared person's display or nickname gets one `name_clash` line
saying this Discord user id is someone else; recognition and roles stay on
stable ids.

Only the owner changes people (IDENTITY-6, ADMIN-3.a): `/admin people
list|add|link|unlink|remove` (owner-only; dispatcher floor ADMIN plus a
handler re-check) SHALL be the only writer besides editing the file on the
VM; no plugin, chat path or model tool SHALL write people. `add` declares a
person or changes their display name, and with its optional `timezone:` /
`hours:` options sets or changes their `timezone` / `working_hours` (an
invalid value is refused, audited `denied`, and nothing is written; they are
cleared only in the file; COS-2.a); `link` / `unlink` add or remove one or
more of `discord` (user picker), `github`, `github_id` and `nickname`;
`remove` drops the person and all links; `list` shows the effective people
(owner marked), their time zone and hours when set, and any problems, under
Discord's 2000-character cap. A
`link` that would put a stable id on a second person (the built-in owner
included) SHALL be refused; an unreadable entry SHALL NOT be edited. TOML
writes SHALL rewrite only that person's read keys (header, comments and
unread keys kept, every other line verbatim), append a new section, or drop a
removed one; JSON writes SHALL change only that person's entry. The rewrite
SHALL be atomic (`writeFileAtomic`) and SHALL be re-read before writing: allow
and deny lists, `[owner]`, every other person and every other section
unchanged, and the person reading back as planned, else refused with nothing
written. Each change SHALL append SAFE-5 audit rows `admin-people-<op>`
(surface `discord:admin`, actor = invoker, args digest only): `started` before
the write, then `ok` / `error`; refusals and a non-owner caught by the handler
append `denied`; no trail wired or a trail that throws SHALL refuse with
`audit log unavailable (SAFE-5)` and write nothing. A bridge that started
without a file SHALL read the file its first `/admin people` change writes.

Acceptance Criteria
- `[people.<id>]` TOML (plural and singular keys) and the JSON `people` object parse to people; the allowlist loader and `[owner]` reader load the same file unchanged.
- Unreadable entries are skipped whole with problems that name the person and key but no account id; `owner` is a reserved id.
- `resolvePerson` resolves by Discord id, `<@id>` and GitHub numeric id (number or string); GitHub logins (alone, or with another numeric id), display names and nicknames resolve nobody; ids of two different people, and an id declared twice, resolve nobody.
- The owner resolves with `role: owner` as the built-in entry (by Discord id and `[owner]` GitHub id, never the `[owner]` login) or as the declared person holding the owner's Discord id; no owner configured ⇒ no owner person.
- People are re-read per call from the loaded file; a missing / unreadable file reads as nobody declared, never a throw.
- A declared chat speaker's prompt names `declared_person`, the declared display (not the Discord one), nicknames and GitHub logins; a stranger with a declared person's display name gets `declared_person: none`; the undeclared owner's and everyone's block with nobody declared are byte-identical to before.
- Through `startBridge`: an `/admin people add` + `link` by the owner and a VM edit of the file change who the next chat message is recognised as, without a restart; a chat message asking to change links changes nothing.
- `/admin people add|link|unlink|remove` edit the file as described, keep every other line verbatim, and each change appends `started` + `ok` rows; no-change requests append nothing.
- Refused: an id linked to another person (including the owner's `[owner]` GitHub login), bad person ids, `owner`, an undeclared person for `link`, invalid link values, an unreadable entry; no audit trail or a throwing trail; the file is unchanged.
- A non-owner is refused at dispatch and at the handler (`denied` row); `list` is owner-only too.
- Only `src/discord/command-handlers/admin.ts` imports the people writer; nothing under `src/` or `plugins/` else does.
- Regression tests `tests/identity.people.test.ts`, `tests/discord.admin-people.test.ts` and `tests/identity.recognise.test.ts` fail on the base sources and pass after.
- SAFE-11 (REQ-discord-071): a stranger named `[owner] L<zero-width>eif` is shown as `display_name: Leif` with a `name_clash` line naming the owner and no owner facts; a stranger named like a declared person gets a `name_clash` line naming that person; the owner and a declared person shown by their own declared display get none; with nobody declared a clean, non-clashing name leaves the block byte-identical to before (`tests/safe.injection.test.ts`, `tests/identity.recognise.test.ts`).
- IDENTITY-7.a (REQ-discord-367): an entry with `github_logins` but no `github_ids` loads without an issue and still matches on Discord, but resolves nobody on GitHub until an id is linked (`tests/identity.github-numeric-id.test.ts`).
- COS-2.a (REQ-discord-102): `timezone` / `working_hours` read from TOML and JSON entries in their canonical spelling (`europe/oslo` → `Europe/Oslo`, `8:30-16:30` → `08:30-16:30`); an unknown zone, an offset such as `+02:00`, a list, hours ending before they start or not `HH:MM-HH:MM` skip the entry whole with a problem naming the person, never an account id; `/admin people add person:<id> timezone:<zone> hours:<HH:MM-HH:MM>` writes only those keys of that person (TOML header, comments, unread keys and every other line kept; JSON keeps the entry's other keys), appends `started` + `ok`, is live on the next read, reports no change for the same values and `old → new` for a change; an invalid value is refused (`denied`, file unchanged); a non-owner is refused; `/admin people list` shows `tz … · hours …` (`tests/identity.briefing-hours.test.ts`).
