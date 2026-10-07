---
change: every-working-day-the-owner-and-each-teammate-get-a-short-briefing-dm-about-their-own-work-in-their-own-hours-and
artifact: design
---

# Design

- **People** (`src/identity/people.ts`): `DeclaredPerson.timezone` /
  `workingHours`, read from `timezone` / `working_hours` (single values,
  TOML and JSON). `normalizePersonTimezone` accepts an IANA-shaped name the
  runtime's `Intl` knows and stores its canonical spelling (no raw offsets);
  `parseWorkingHours` / `normalizeWorkingHours` accept `H:MM-HH:MM` with
  start before end and store `HH:MM-HH:MM`. A bad value makes the entry
  unreadable (skipped whole), like every other bad value: fail closed.
- **Writer** (`src/discord/admin-people.ts`, `command-handlers/admin.ts`,
  `slash-commands.ts`): the existing `add` op takes optional `timezone` /
  `hours`; the plan validates them (refused, nothing written), sets
  `timezoneChanged` / `hoursChanged`, and the TOML / JSON renderers and the
  re-read safety net carry the two keys. Audit rows, the owner re-check and
  the atomic write are unchanged (`admin-people-add`). No new subcommand.
- **Briefing module** (`src/scheduler/briefing.ts`, on the scheduler):
  `briefingRecipients` (owner + team via `resolvePerson`, deny / mute /
  clash excluded) → `briefingHoursFor` / `briefingSlot` (Intl local clock,
  Mon–Fri, [start, end)) → `claimBriefingDay` (IMMEDIATE claim of the local
  day in `cos_briefings`) → `readLocalBriefingFacts` (their `/work` tasks,
  schedule runs and open schedule questions by their Discord ids; the
  owner's pending Approve card counts) + `readGithubBriefingFacts` (Octokit
  issue search by login, kept only on allowlisted repos and their numeric
  ids) → empty ⇒ `skipped` → `createBriefingComposer` (one read-tier
  no-tools `chatCompletions` call through `createSpendGuard`; persona +
  rules + fenced facts; reply scrubbed, defanged, cut) → `pending` (text
  held scrubbed) → `takeBriefingToSend` (`sending`) → gateway `sendDm` →
  `sent` (text dropped, `covered_to` advanced) or back to `pending` (retry
  every 15 min within hours) → `expired` past the hours.
- **At most once**: the claim precedes every read, `sending` is never
  retried, a `sent` day is never reclaimed; only a failed model call or a
  compose a dead process left (30 min old) is reclaimed, three times a day.
  A crash after the DM went out but before `sent` is recorded leaves
  `sending` (no second DM).
- **Spend**: the guard has no `approval`, so a cap stop is a
  `SpendCapRefusal` before any request (no card). The composer returns
  `spend-cap`; the ticker marks the day `budget` and the bridge hands the
  stop's ask to `spendDm.deliver({ stop })` once a day, the same owner-only
  DM other cap stops use (SAFE-14.a). Warnings are recorded in the ledger
  (the bridge's next tick DMs them).
- **Tick**: `SchedulerServiceOpts.briefings` called after the backup each
  tick (one pass at a time, fire-and-forget, never throws), also while
  schedules are off. Bridge wiring next to the backup ticker; off in a dry
  run unless `StartBridgeOptions.briefings` seams are passed (tests); `stop()`
  aborts a call in flight. The daemon gets no ticker (no DM path).
- **Transport**: `chatCompletions` / `Completion` exported from
  `src/agent/execute.ts` (unchanged), instead of a second HTTP client.
- **Scrub**: `cos_briefings.text` added to `SCRUB_TARGETS` (new table, no
  rules version bump).
