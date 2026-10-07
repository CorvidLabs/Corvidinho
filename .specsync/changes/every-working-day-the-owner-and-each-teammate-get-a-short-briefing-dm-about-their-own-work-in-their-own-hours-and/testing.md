---
change: every-working-day-the-owner-and-each-teammate-get-a-short-briefing-dm-about-their-own-work-in-their-own-hours-and
artifact: testing
---

# Testing

`tests/identity.briefing-hours.test.ts` (7 tests) and
`tests/cos.briefing.test.ts` (17 tests). Fixtures only: temp allowlist
files, in-memory or temp-file SQLite, a fixed clock (Wednesday 2026-10-07),
a fake LLM (the provider fetch: records each request, answers with a
chat-completions body), a fake GitHub (search answers by query, requested
reviewers by PR) and a fake DM send; the bridge case uses a dry-run bridge
with the `briefings` seams and a gateway factory that records `sendDm` and
channel replies. Every run used a private `TMPDIR`.

Fail-on-base proof (base 85871fa4):
- With every modified source from the base (`src/identity/people.ts`,
  `src/discord/admin-people.ts`, `src/discord/command-handlers/admin.ts`,
  `src/discord/slash-commands.ts`, `src/scheduler/service.ts`,
  `src/scheduler/index.ts`, `src/discord/bridge.ts`, `src/store/scrub.ts`,
  `src/agent/execute.ts`) and no `src/scheduler/briefing.ts`: both files
  fail to load (the module and the people exports do not exist) — 0 pass,
  2 fail.
- With the branch's `src/identity/people.ts` and the base's writer, handler
  and slash registration: `tests/identity.briefing-hours.test.ts` 4 pass,
  3 fail — the three `/admin people add` cases (no `timezone` / `hours`
  options: the base writes nothing for them and never refuses a bad zone);
  the 4 that pass are the people-reading units and the non-owner guard.
- With the branch's `people.ts`, `execute.ts` and `briefing.ts` and the
  base's `service.ts`, `bridge.ts` and `scrub.ts`:
  `tests/cos.briefing.test.ts` 14 pass, 3 fail — the scheduler tick case
  (the base tick never calls `briefings.tick`), the bridge case (no DM: the
  base bridge builds no ticker) and the scrub case (`cos_briefings` not in
  `SCRUB_TARGETS`).
- Restored: 24 of 24 pass; the related suites (`identity.*`,
  `discord.admin*`, `scheduler.*`, `store.scrub`, `ops.backup*`,
  `discord.slash*`; 355 tests) pass, as does the full `bun test`.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-036` | `tests/identity.briefing-hours.test.ts` ("TOML and JSON entries read timezone and working_hours, canonical spelling", "a bad time zone or hours makes the entry unreadable …", "the zone and hours never match anyone …") | `europe/oslo` → `Europe/Oslo`, `8:30-16:30` → `08:30-16:30`, JSON `timezone` / `working_hours` read; `Mars/Olympus_Mons`, `+02:00`, a list, `17:00-09:00`, `9am-5pm`, `24:00-25:00` skip `tofu` whole with an issue naming the person and never the Discord id; the owner still resolves on the Discord id only. |
| `REQ-discord-036` | `tests/identity.briefing-hours.test.ts` ("owner sets and changes them …", "an invalid time zone or hours is refused …", "a non-owner cannot set them …", "the plan writes only that person …") | `/admin people add person:tofu timezone:europe/oslo hours:8:30-16:30` writes `timezone = "Europe/Oslo"` and `working_hours = "08:30-16:30"` inside `[people.tofu]` (header comment and unread `team` key kept, file head verbatim), `admin-people-add` `started` + `ok`, live on the next read; the same zone is `No change … (time zone Europe/Oslo, hours 08:30-16:30)`; a new hours value reads `08:30-16:30 → 10:00-18:00`; `list` shows `tz Europe/Oslo · hours 10:00-18:00`; a new person can be declared with a zone; bad zone and hours refused, `denied` twice, file unchanged; a non-owner gets `not authorized`; a JSON plan keeps the entry's other key. Fail on base. |
| `REQ-discord-102` | `tests/cos.briefing.test.ts` ("their declared zone and hours; else the owner's zone and 9am; else UTC and 9am", "Monday to Friday in their zone …", "owner and team only …") | Tofu: `Europe/Oslo` 08:30–16:30 from the person; Bob: `America/New_York` (owner's) 09:00–17:00 default; neither: UTC 09:00; 06:25Z not due, 06:30Z due, 14:30Z over, 23:30Z is Thursday in Oslo, Saturday and Sunday never; recipients leif (owner) / tofu / bob, never ada (community); deny-listed Bob and muted Tofu out; an id on two people out; no owner → nobody. |
| `REQ-discord-102` | `tests/cos.briefing.test.ts` ("Tofu gets one DM at the start of their hours in Oslo, about Tofu only, written by the model") | Nothing at 08:25; at 08:35 exactly one DM to Tofu's id with the fixed header and the model's text; one call to `https://llm.test/v1/chat/completions`, model `gpt-4o-mini`, no `tools`, system with the briefing instructions and PERSONA-3 rules, user with the fenced facts: Tofu's PR #7, assigned issue #11, blocked task, review request #9, schedule question, finished task, 2 schedule runs — and none of Bob's task, a 30-day-old task, the off-allowlist and denied repos, impostor PR #8 (author id 9999), PR #10 (reviewer 9999) or the owner's Approve card; GitHub searched with Tofu's login only, since 24 h back; the row `sent`, text null, `covered_to` = now. |
| `REQ-discord-102` | `tests/cos.briefing.test.ts` ("never twice a day …", "the claim is once per person per local day …") | Ticks at 06:36 and 12:00 and a second ticker on the same DB send nothing more; Thursday sends one that keeps the blocked task and drops the already-covered finished task; weekend nothing; claim → null within the day, a dead compose reclaimed after 30 min up to 3 attempts, a sent day never reclaimed, the next day returns `since` = the last `covered_to`. |
| `REQ-discord-102` | `tests/cos.briefing.test.ts` ("without a zone: the owner's declared zone and 9am; without the owner's zone: UTC and 9am") | At 08:55 New York neither Bob nor the owner; at 09:05 both (and Tofu, 15:05 Oslo); Bob's prompt holds only `Bob refactor done` and `(their time zone America/New_York)`; the owner's holds `1 forget Approve card waiting in your DMs`, not the card's title or Bob's task; with no zone on the owner's entry Bob's comes at 09:05 UTC, not 08:55. |
| `REQ-discord-102` | `tests/cos.briefing.test.ts` ("nothing to say: the day is skipped …", "no DM path yet: nothing is claimed or written") | No facts → no model call, no DM, row `skipped`, no call on the next tick; no `sendDm` → no call and no row. |
| `REQ-discord-102` | `tests/cos.briefing.test.ts` ("the model's text is scrubbed and mass mentions defanged …", "a DM that does not go out is retried …, then dropped …") | A reply with a `ghp_…` token and `@everyone`: held `pending` without either, `cos_briefings` in `SCRUB_TARGETS` and a re-scrub changes nothing; after the 15-minute wait the DM carries `[redacted:github-token]` and the defanged mention and the text is dropped. A refused DM is tried once in the wait, logged once, `expired` with text null at 16:31 Oslo, never re-written. Scrub case fails on base. |
| `REQ-discord-102` | `tests/cos.briefing.test.ts` ("at a spend cap the briefing is not written …", "a failed model call is retried later the same day …") | Cap 0: no request, no DM, both rows `budget`, one `spend-cap` stop handed over, none on a later tick; a failed call → `failed`, too soon no retry, 30 min later sent, `attempts` 2. |
| `REQ-discord-102` | `tests/cos.briefing.test.ts` ("every tick hands the briefings its clock …", "the bridge sends the DM through the gateway's DM path only …") | Two ticks with `schedulesEnabled` false call `briefings.tick` with the tick clock twice; `startBridge` (dry run, file DB, owner + team in the allowlist file, seams) sends exactly one DM to Tofu with the header and posts no channel reply; the composer saw Tofu's blocked task. Both fail on base. |
| `REQ-agent-102` | `tests/cos.briefing.test.ts` ("Tofu gets one DM …", "at a spend cap …") | The exported `chatCompletions` posts to the provider's `/chat/completions` with the model and no `tools` key; under a cap of 0 the request is never sent and the composer reports `spend-cap`. `tests/work.review.test.ts` (same call for GITHUB-9) unchanged and green. |
