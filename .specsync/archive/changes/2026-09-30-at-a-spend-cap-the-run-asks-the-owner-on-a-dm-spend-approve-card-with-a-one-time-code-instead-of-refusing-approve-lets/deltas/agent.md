---
module: agent
change: at-a-spend-cap-the-run-asks-the-owner-on-a-dm-spend-approve-card-with-a-one-time-code-instead-of-refusing-approve-lets
---

# Delta: agent (at a spend cap the run asks the owner on a spend Approve card; Approve + code lets only that call through, SAFE-8 / SAFE-8.a / SAFE-15 / SAFE-19)

## Added

### REQUIREMENT REQ-agent-198

At 100% of a spend cap the agent SHALL ask the owner on a DM Approve card
instead of refusing (SAFE-8, AUTONOMY-8), for each cap (SAFE-15). When
`createSpendGuard` is given `approval` (`SpendApprovalOptions`: the run's
task text, a `project` label read only when a card is raised, and `onNote`
for the run's one-line notes; `createTaskExecute` passes all three, the
project as `projectLabel(projectKeyFor(cwd))`, never a host path) and an
owner is configured (`getOwner`, the allowlist file of the guard's env or,
when that env names none, of this process), a priced provider call whose
reservation is refused at the total cap or its provider's cap SHALL be held,
not sent, and SHALL wait for the owner's decision on a spend card:

- The guard SHALL record one request on the shared approvals store
  (`ApprovalStore.request`, `approval_requests`) per paused call: kind
  `SPEND_CARD_KIND` (`spend`), class `SPEND_CARD_CLASS` (`money`, so Approve
  also needs the SAFE-19 one-time code), title `Spend past a cap — asks first
  (SAFE-8) · from <surface>`, action `send one model call to <model> via
  <provider>`, target the tripped scope(s) (`total`, `provider:<id>`, or both
  in that order), amount that call's estimate (`~$X (this one call's
  estimate)`), and as text (quoted data before the card) who asked on which
  surface, the project label, each tripped cap's 24-hour spend when it paused
  and the task text (SAFE-6 scrubbed first, then cut to at most
  `SPEND_CARD_TASK_MAX` characters, a longer task marked as cut, so a secret
  the cut splits never shows in part) — `spendCardFields`; requester the
  acting user
  (`auditContextFromEnv`), waiter this process (`<pid>:<proc start>`), and a
  lifetime of `SPEND_CARD_TTL_MS` (4 minutes, below `COUNCIL_VOICE_TIMEOUT_MS`
  and `LLM_REQUEST_TIMEOUT_MS`). Before recording it SHALL check the call
  against the caps again (re-fit) and send it without a card when it now
  fits.
- It SHALL emit one note `[operator] AUTONOMY-8: waiting for the owner's OK
  on an Approve card with the one-time code (…; request <id>; no answer by
  <time> means no, and nothing is spent — …)` (secret-scrubbed, no amounts;
  a Text event in `createTaskExecute`, which the live status shows as the
  must-ask wait line), then poll the store (`waitForDecision`,
  `SPEND_CARD_POLL_MS`) until the card is decided or lapses, or the call's own
  abort signal (the run's stop, or its per-request timeout) ends the wait.
- Only an approval the guard uses once (`consume`, approved → used) while
  the call's signal is not aborted SHALL let the call through, and then only
  that call: `SpendLedger.reserveApproved` records exactly one row at the
  estimate the card showed (the fit check runs again in the same IMMEDIATE
  transaction and names the caps the call still passes; an estimate over the
  approved amount, or a call that would by then pass a cap outside the target
  the card showed — e.g. other runs took the total past its cap while a
  provider cap's card was open — records nothing and is a no, since an
  approval counts only for what its card showed), after which the call is sent
  and settled like any other and a second note says the owner approved it.
  The next call past a cap SHALL be checked again and raise a new card and
  code (SAFE-8.a); no approval covers more than one call.
- A deny, no answer before the card lapses (a late code or answer counts for
  nothing, SAFE-20), an aborted wait, an approval that no longer matches the
  call (above), or a card that could not be raised or read SHALL be a no:
  nothing is sent or recorded, and the call throws
  `SpendCapRefusal` with `spendCapReachedAsk({ estimateMicroUsd, trips, card:
  { requestId, outcome } })` — outcome `denied`, `expired`, `aborted`,
  `changed` or `unavailable`, the trips being every cap the call then passes
  — so the attempt ends `blocked` with the generic summary
  (SAFE-14.a) and a question that names the card, what it came to, the
  `Stopped at cap: …` marker, and both ways on (ask again for a new card and
  code, or the operator action), without the reply note. A stop that lands as
  the owner approves wins: the approval is left unused.
- A run SHALL have at most one spend card open at a time: a later paused
  call of the same guard waits for the earlier card to be decided, then is
  re-fit and gets its own card. No call SHALL be refused because another
  run's card is open: several runs paused at once each get their own card.
- The execute hook SHALL treat a `SpendCapRefusal` as no model failure even
  when the request's timeout fired during the card wait, so no AGENT-11
  fallback routes around a cap.
- With no owner configured, without `approval` (`withSpendCap`), and for the
  unpriced-model, invalid-setting and ledger stops (no price to approve), no
  card SHALL be raised and the stop SHALL keep the operator-action ask of
  REQ-agent-098 / REQ-agent-114.
- A CLI-only or daemon-only install (no bridge to DM the card) SHALL record
  the card all the same and wait out its lifetime; the lapse is a no and
  nothing is spent. The bridge's card engine closes a card whose waiting
  process is gone as a no (REQ-discord-198).

Acceptance Criteria
- Owner configured, $0.9990 of a $1.00 cap spent: a `gpt-4o` call raises one `spend` / `money` card with action `send one model call to gpt-4o via llm.test`, target `total`, amount `~$… (this one call's estimate)`, title `Spend past a cap — asks first (SAFE-8) · from cli`, requester `local`, this process as waiter and a text naming the surface, the project label, `total $0.9990 of $1.00` and the task.
- Approved (and used): the call is sent once, the request ends `used`, the ledger gains one row at exactly that estimate (then settled), and the notes are the wait line (which `progressFromFrame` maps to the must-ask wait status, no `$`) and the approval line; `finish` leaves the result alone.
- After one approved call, the next call past the cap raises a second card; denied, it sends nothing more (SAFE-8.a).
- Denied: no call, no ledger row, request `denied`; the ask (`spendScopes` `["total"]`) says the owner denied Approve card `<id>`, keeps `Stopped at cap: total.`, offers asking again and the operator action, and has no reply note and no `?`; `finish` gives `SPEND_CAP_SUMMARY` and keeps `filesChanged`.
- No answer before the card lapses: request `expired`, nothing sent or recorded; an approval recorded after that does not take.
- The call's abort signal ends the wait at once: request `expired`, nothing sent; a stop that lands as the owner approves sends nothing and leaves the approval unused.
- No owner configured (even with a long card lifetime): the plain ask at once, no card; `withSpendCap` with an owner: no card; an unpriced model under a cap: no card.
- A provider cap's card targets `provider:llm.test`; a call past both caps targets `total, provider:llm.test`.
- Two paused calls of one run: the second card is recorded only after the first is decided; two runs paused at once each have a pending card.
- `reserveApproved` records the approved amount past the cap with the tripped caps named, refuses a larger estimate with no row, and records a call that fits with `trips` empty; a call that would now also pass a cap outside the approved scopes is refused (`reason: "target"`) with no row.
- A provider cap's card approved after other spend took the total past its cap too: nothing is sent or recorded, the request ends `used`, and the ask (`spendScopes` both caps) says the approval did not stretch to a cap the card did not show, with no reply note.
- A task whose secret straddles the `SPEND_CARD_TASK_MAX` cut shows no part of the secret on the card.
- `SPEND_CARD_TTL_MS` is below `COUNCIL_VOICE_TIMEOUT_MS` and `LLM_REQUEST_TIMEOUT_MS`.
- `createTaskExecute` at a $0 cap: approved, the run's one call goes out and its Text events include the wait and approval lines; the card's text holds the task, never the run's directory; denied, `runTask` returns `blocked` with the generic summary and verify not run; a card wait cut short by a 50 ms request timeout with a two-model chain calls no provider and never falls back.
- These tests fail on main's sources.

## Modified

### REQUIREMENT REQ-agent-098

The agent SHALL enforce an optional operator-set daily spend cap on provider
(LLM) calls (SAFE-8, as amended on #98: warn at 80%, ask at 100%) in
`src/agent/spend.ts`. The cap SHALL be read from
`CORVIDINHO_DAILY_SPEND_CAP_USD` as a plain USD amount over a rolling
24-hour window. When it and `CORVIDINHO_PROVIDER_SPEND_CAPS_USD`
(REQ-agent-114) are unset or blank, the capped fetch SHALL be the
provider fetch unchanged and the database SHALL NOT be opened, so behavior
is unchanged. When it is set, `createTaskExecute` SHALL send every
OpenAI-compatible call through the capped fetch, which SHALL price the call
from a per-model table (standard USD per 1M input/output tokens, exact model
id match), estimate it from the request size plus a fixed reply reserve,
and, in one IMMEDIATE transaction on the shared SQLite `spend_ledger` table,
reserve the estimate unless spend in the last 24 hours plus the estimate
would exceed the cap. After the reply, the reservation SHALL be settled to
the provider-reported token usage cost; it SHALL stay at the estimate when
usage is missing or the request failed at the network, and SHALL count zero
when the provider returned an HTTP error.

At 100%, a call whose estimate would exceed the cap SHALL NOT be sent as
is. With an owner configured and the guard given `approval` (as
`createTaskExecute` does), the call SHALL first wait for the owner's spend
Approve card (REQ-agent-198) and SHALL be sent only on an approval used
once. Otherwise — no owner configured (nobody can approve), no `approval`
given, or that card came to no — the attempt SHALL end with
`ask: {reason: "spend-cap", question}` whose question states the 24-hour
spend, the call estimate and the cap, names the operator action that
continues (raise or unset the cap where Corvidinho runs and restart, or wait
for earlier spend to leave the window, then ask again) and, with no card,
says a reply cannot lift the cap, without a yes/no question (after a card it
names the card and what it came to and adds asking again for a new card and
code, REQ-agent-198); the attempt's summary SHALL be the generic `SPEND_CAP_SUMMARY`,
which is `SPEND_PAUSED_TEXT` "Work is paused for budget." (SAFE-14.a), with no
amounts, no cap and no env names (safe for a public reply such as a WATCH
comment), and `runTask` SHALL return state `blocked` (never `done`, verify
not run, no retry) through the AUTONOMY-1/2 ask path. A model with no known
price, a cap value that is not a plain USD amount (never echoed), or an
unavailable ledger SHALL end the attempt the same way (never counted as
free, fail closed; no card is raised for them, since there is no price to
approve). The runner SHALL NOT send a provider call past the cap, except the
one call an owner's spend card approved (REQ-agent-198, SAFE-8.a).

At 80%, after a call settles, when 24-hour spend is at or above 80% of the
cap and the warning for that cap value is armed, the module SHALL record one
pending warning in the module-owned `spend_alerts` table
(`src/agent/spend-alerts.ts`) within one IMMEDIATE transaction (so
concurrent processes warn once between them), emit one `Text` event naming
the spend, the cap and the percent, report it through `onSpendWarning`, and
`TaskResult.spendWarning` SHALL carry the integer amounts. The warning SHALL
be armed once per crossing: it disarms when recorded and re-arms when a
settle or a later reservation sees spend under 70% of that cap value, 24
hours after the last warning, or for a new cap value. Recording SHALL be
separate from delivery: a recorded warning SHALL stay pending until a
surface that can reach the owner claims it (`src/agent/spend-outbox.ts`
`createSpendAlertOutbox`: `takeWarning` claims every pending warning of the
last 24 hours in one IMMEDIATE transaction and returns current spend against
the recorded cap; while spend is back under 80% of that cap it SHALL claim
nothing and leave the warning pending — the crossing stays disarmed, so no
second warning is recorded — for the first post that sees 80% or more;
`release` returns a claimed warning when the post failed; `claimCapPing`
allows one owner ping per cap episode, re-armed the same way, and returns a
claim whose `release` hands the ping back when the post that carried it
failed). The module SHALL also report spend against the cap for doctor and
the owner's Discord `/status` line (AUTONOMOUS-8), and SHALL provide the only
spend line anyone else sees (SAFE-14.a): `spendPaused(snapshot)` is true while
runs stop at the spend check (24-hour spend at or past the cap, an unpriced
model, an invalid cap value, an unreadable ledger), and
`formatSpendPublicStatusLine(snapshot)` is "Spend: Work is paused for budget."
then and undefined otherwise, naming no amount, cap, model, path or setting.
The bridge delivers the claimed warning to the owner by DM only
(REQ-discord-098). This cap is the total cap (scope `total`) of SAFE-14:
the per-provider caps next to it, and SAFE-15's 80% warning and 100% stop
for each cap, are REQ-agent-114, and a call is checked against this cap and
its provider's cap in the same reservation. The Approve card that
continues past a cap (#96, SAFE-18..20) is REQ-agent-198.

Acceptance Criteria
- No cap: the capped fetch is the same fetch and no database file is created.
- Under the cap: the call is sent, the caller can still read the reply, and the ledger row settles to the usage cost in integer micro-USD.
- Spend plus estimate over the cap (including a zero cap): no fetch; the attempt returns a `spend-cap` ask naming spend, estimate, cap and `CORVIDINHO_DAILY_SPEND_CAP_USD`, ending with the operator action and no question mark; the summary is `SPEND_CAP_SUMMARY` (no `$`, no `CORVIDINHO_`); `runTask` returns `blocked` with verify skipped; `task run --json` exits 0 with `result.ask.reason` `spend-cap`.
- Spend older than 24 hours no longer counts.
- Unpriced model, invalid cap value or unavailable ledger: no fetch and a `spend-cap` ask; the invalid value and secret-shaped model ids are not echoed.
- HTTP error reply counts 0; missing usage and network errors keep the estimate.
- Two connections on one DB file see each other's reservations and record the 80% warning once between them.
- The call that brings spend to 80% yields exactly one `Text` warning and one `onSpendWarning`; later calls stay quiet while spend stays at or above 70%; after spend is seen under 70% (by a settle or a reservation) the next crossing warns again, including within 24 hours; 24 hours after the last warning, or with a new cap value, it warns again; `task run --json` carries `result.spendWarning` on the crossing run.
- A warning recorded by one process is taken once by the outbox with current spend, can be released and taken again, and stays pending (not delivered, not dropped) while spend is back under 80%: 80% at T0, then 72%, then 96% delivers exactly one warning at 96% and records no second warning; without a database the outbox returns the run's own warning.
- `claimCapPing` returns a claim once per cap episode and again after spend is seen under 70% or 24 hours pass; a released claim lets the next claim in the same episode succeed.
- An invalid total cap reads as the snapshot `{ kind: "invalid", keys: ["CORVIDINHO_DAILY_SPEND_CAP_USD"] }`; a reservation refused at the total cap names it (`trips: [{ scope: "total", spentMicroUsd, capMicroUsd }]`), and its ask question says `Stopped at cap: total.` (REQ-agent-114).
- `SPEND_PAUSED_TEXT` is "Work is paused for budget." and `SPEND_CAP_SUMMARY` equals it; `formatSpendPublicStatusLine` is undefined with no cap and under the cap, and "Spend: Work is paused for budget." at the cap, for an unpriced model, an invalid value and an unreadable ledger; `spendPaused` flips exactly at the cap; the owner's `formatSpendStatusLine` keeps the amounts.
- With an owner configured and `approval` given, a call over the cap is held for the owner's spend card (REQ-agent-198); with no owner, or through `withSpendCap` (no `approval`), the ask above comes at once with no card and still ends with "Replying can't lift the cap — this needs the operator."
- After a spend card came to no, the ask keeps the amounts and the `Stopped at cap: …` marker, names the card and what it came to, adds "ask again — the next call past the cap raises a new card and code", and has no reply note and no question mark.

### REQUIREMENT REQ-agent-114

It keeps rolling 24-hour spend caps per provider plus a total cap, and tracks
spend against each (SAFE-14); it warns at 80% of a cap and stops and asks at
100%, for each cap (SAFE-15) — both captured from Leif's 2026-09-28
interview, round 4. `src/agent/spend.ts` SHALL read an optional
`CORVIDINHO_PROVIDER_SPEND_CAPS_USD` next to the total cap
`CORVIDINHO_DAILY_SPEND_CAP_USD` (REQ-agent-098): a comma list of
`provider=USD` entries keyed on the configured provider id — the endpoint
host that `providerId` (`src/agent/providers.ts`, AGENT-13) gives an entry,
which is what the ledger records as a call's `provider` (the request URL
host); keys match case-insensitively. Every cap SHALL be optional
(`parseSpendCaps`: `off`, `invalid` with the bad setting names, or `caps` with
a nullable total and a provider map). The provider setting SHALL be invalid
as a whole when any entry is malformed (no `=`, a blank entry or key, a key
that is not a host, a duplicate key, an amount that is not a plain USD
amount; `parseProviderCapList`) or when a key names no configured provider
(`configuredProviderIds`: every entry of `CORVIDINHO_LLM_MODEL` and the
per-tier keys, fallback entries included). An invalid setting SHALL stop
every provider call with a `spend-cap` ask naming the setting, before the
ledger opens, and SHALL never echo its value.

While any cap is set, every priced provider call SHALL be recorded in
`spend_ledger`, and `SpendLedger.reserve` SHALL check, in the one IMMEDIATE
transaction that reserves the estimate, the total cap (if set) against all
recorded spend and the call's provider cap (if set) against that provider's
spend (`SpendLedger.window(now, provider?)`, backed by an index on
`spend_ledger(provider, ts)`; the provider is compared as stored, scrubbed).
A refused reservation SHALL name every tripped scope, `total` first, then
`provider:<id>` (`trips`). The call SHALL NOT be sent: the attempt ends with
a `spend-cap` ask whose question names each tripped scope with its 24-hour
spend and cap, the call's estimate, the setting that lifts it (raise or
unset the total, raise or remove the provider's entry) and the fixed marker
`Stopped at cap: <scope>.` / `Stopped at caps: <scope>, <scope>.`, and whose
`spendScopes` lists those scopes; the summary stays the generic
`SPEND_CAP_SUMMARY` (SAFE-14.a), and `runTask` returns `blocked` as for the
total cap. The stop SHALL be thrown as `SpendCapRefusal` before any request,
so it is never a model failure: no model fallback (AGENT-11) may route a
stopped call to another provider or model. Calls to a provider with no cap
of its own still count against the total cap. A model with no known price
SHALL stop and ask when a cap covers its call (the total cap, or its
provider's cap; the ask names that scope) and SHALL be sent unrecorded when
none does (its cost stays unknown, never counted as free, SAFE-16).

At 80%, after a call settles, each cap the call counts against SHALL be
checked on its own: the warning state in `spend_alerts` SHALL be kept per
scope and cap value (a `scope` column, `total` or `provider:<id>`, added by
an idempotent ALTER with default `total` for older rows, written through
`scrubSecrets`; no schema version bump), so each cap warns once per crossing
and re-arms when its own spend is seen under 70%, after 24 hours, or for a
new cap value; a provider cap's `SpendWarning` carries its `scope` (absent =
the total cap), and `formatSpendWarningLine` names it. The outbox
(`takeWarning`) SHALL hand over one warning per claimed cap (`warnings`),
each with that scope's current spend, leaving a cap whose spend is back under
80% pending; `claimCapPing(scopes)` SHALL claim the owner ping once per
episode of each scope a stop tripped (default the total cap), and
`spendScopesOf(ask)` SHALL give those scopes from the ask's `spendScopes`, or
from its question's marker when the ask was stored as text only (a schedule
run's recorded ask, the daemon's). `askFromUnknown` SHALL keep well-formed
`spendScopes` (at most 8) of a `spend-cap` ask and drop anything else.

`readSpendSnapshot` SHALL report each provider cap with its provider's spend
(`providers`, sorted by id; `capMicroUsd` absent when no total cap is set),
treat a model as unpriced only when a cap covers its calls, and
`spendDoctorChecks` / `formatSpendDoctorLines` SHALL give the `spend` line
(the total cap, or "no total daily cap set" without amounts) and one
`spend provider:<id>` line per provider cap (spend, cap, percent, calls, `warn`
at 80% and at the cap; never fails doctor); `formatSpendStatusLine` SHALL add
one owner `/status` line per provider cap; `spendPaused` SHALL be true while
any cap is reached, so anyone but the owner sees only "Spend: Work is paused
for budget." (SAFE-14.a). Amounts, scopes and setting names SHALL appear only
in the ask question, the owner's DMs and `/status` lines, doctor, `task run`
output and the daemon's logs. The Approve card that continues past a cap
(SAFE-8, SAFE-8.a, SAFE-18..20) is REQ-agent-198: with an owner configured, a
call past any cap first waits on the owner's spend card, whose target names
each tripped scope (`total`, `provider:<id>`); with no owner, and for the
invalid-setting and unpriced stops, the stop keeps the operator-action ask of
REQ-agent-098.

Acceptance Criteria
- `configuredProviderIds` lists the host of every chain entry of every tier key (OpenAI, Anthropic, Ollama's `127.0.0.1:11434`, a custom `CORVIDINHO_LLM_BASE_URL` host); `parseSpendCaps` is `off` with nothing set, `caps` with a total only, providers only (keys lower-cased, spaces trimmed) or both.
- A missing `=`, empty key or amount, a non-USD or negative amount, a blank entry or trailing comma, a duplicate key, a key with a space, an amount over 1e9, or a well-formed key that no configured model uses makes the provider setting invalid; both settings bad name both.
- `window(now, provider)` counts only that provider's calls in the window; `idx_spend_ledger_provider_ts` covers `(provider, ts)`.
- `reserve` refuses past the total (Anthropic under its own cap, total over), past the call's provider cap (on that provider's spend alone) or both (`total` first) and names each; a provider under its own cap with no total is reserved.
- The capped fetch stops a call past its provider's cap with no fetch, `spendScopes` `["provider:api.openai.com"]`, a question starting "Daily spend cap reached (SAFE-15): $0.9990 spent on api.openai.com in the last 24h (99% of its $1.00 cap)" naming `Stopped at cap: provider:api.openai.com.` and the entry to raise, never `CORVIDINHO_DAILY_SPEND_CAP_USD`; `finish` gives `SPEND_CAP_SUMMARY`; a call to an uncapped provider is sent and recorded.
- With both caps, a call past the total only names `total`; a call past both names both, `would pass 2 caps`, and both settings.
- A bad provider setting stops calls to every provider, creates no DB file and never echoes the value or a secret-shaped key.
- An unpriced model stops under its provider's cap (naming that cap and entry) and runs unrecorded on a provider no cap covers.
- One call crossing 80% of a provider cap records one warning with its scope; later calls stay quiet; the total cap's crossing warns separately without a scope; the rows carry their scopes.
- `createTaskExecute` with a two-model chain and the head provider at its cap ends the attempt with the spend-cap ask and makes no provider call at all.
- The outbox hands over one warning per cap with current spend and returns both on release; a cap back under 80% stays pending while another is claimed; the owner's DM has one line per cap.
- `askPingOwner` pings once per episode of each cap (a second provider's stop and the total's each ping; a released claim pings again); a stored question-only stop names its caps through `spendScopesOf` and claims their episodes; `askFromUnknown` keeps well-formed scopes only; `askPingKey` keys a schedule's spend-cap ping on its provider scopes (the total alone keys as before).
- A provider warning keeps its scope through `spendWarningFromUnknown`; the public ask post names no scope, provider, amount or setting.
- An older `spend_alerts` gets `scope` (existing rows `total`); re-scrub before that ALTER does not throw; `SCRUB_TARGETS` lists `spend_alerts.scope`, which is stored and re-scrubbed redacted.
- The snapshot lists each provider cap; doctor prints `spend` plus `spend provider:<id>` lines (`warn` at 80% and at the cap, all `ok: true`); the owner's `/status` has one line per cap; the public line is "Spend: Work is paused for budget." while any cap is reached; with provider caps only the `spend` line shows no amount and an unpriced model warns only when a cap covers it; an invalid provider setting is named (never its value) on doctor and `/status`.
- `corvidinho doctor` with an Anthropic model and `CORVIDINHO_PROVIDER_SPEND_CAPS_USD=api.anthropic.com=2` prints `[info] spend: no total daily cap set` and `[ok] spend provider:api.anthropic.com: $0.00 of $2.00 daily cap …`.
- These tests fail on main's sources.
- A spend card for a call past a provider cap has target `provider:<id>`; for a call past both caps, `total, provider:<id>`, and its text names each cap's spend when it paused (REQ-agent-198).
