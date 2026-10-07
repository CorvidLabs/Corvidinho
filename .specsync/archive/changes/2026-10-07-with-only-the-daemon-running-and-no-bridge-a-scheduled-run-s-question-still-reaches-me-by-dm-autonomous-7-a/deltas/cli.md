---
module: cli
change: with-only-the-daemon-running-and-no-bridge-a-scheduled-run-s-question-still-reaches-me-by-dm-autonomous-7-a
---

# Delta — cli (`corvidinho daemon` DMs the owner a schedule's question while no bridge runs, AUTONOMOUS-7.a)

## Added

### REQUIREMENT REQ-cli-707

With only the daemon running and no bridge, a scheduled run's question SHALL
still reach the owner by DM (AUTONOMOUS-7.a, captured with `hi` in this
change from Leif's 2026-09-28 interview, round 17). `corvidinho daemon`
SHALL wire its scheduler's owner DM (REQ-discord-707):

- `send`: with a bot token (`resolveDiscordToken(env)`), `createRestSendDm`
  over Discord's REST API (no gateway session); `StartDaemonOptions.discordRest`
  is the test seam for the REST client. Without a token there is no `send`,
  and a waiting ask logs `schedule_ask.dm_unavailable` once.
- `bridgeLive`: `bridgeRunning(db)` (`src/watch/owner-ask.ts`), the
  `schema_meta` mark a bridge with a scheduler and a DM path writes on this
  data dir, counted only while its process is alive.
- `spendAlerts`: the shared spend alert outbox on the daemon's DB, so a
  spend-cap stop's details reach the owner once per cap episode.
- `log`: the daemon's JSON-line logger (scrubbed, SAFE-6), with
  `schedule_ask.dm_error` (warn, the REST reason) from the REST sender.

`daemon.started` SHALL carry `ownerDm`: `on`, `no-token` or `no-owner` (the
owner as loaded at start). On stop, after the runs' grace and before the DB
closes, the daemon SHALL wait up to `ABANDONED_SETTLE_MS` for an owner DM in
flight (`settleAskDelivery`), which hands an unfinished one back. The token
SHALL never appear in a log line. It SHALL add no environment variable: the
token and the owner are the bridge's (`.env.example` says the daemon reads
them too). `docs/DAEMON.md` SHALL document the DM, its log events and the
no-token / no-owner behaviour; the test preload SHALL unset
`DISCORD_TOKEN` / `DISCORD_BOT_TOKEN` so `bun test` never DMs for real.

Acceptance Criteria
- With a fake bot token, an owner and a fake REST client, a daemon's stuck run logs `daemon.started` with `ownerDm` `on`, `run.needs_human` and `schedule_ask.dm_sent`, and the REST client sees `POST /users/@me/channels` (`recipient_id` the owner) then `POST /channels/<dm>/messages` with the question, the daemon note, `allowed_mentions.parse = []` and no components; no log line carries the token.
- A Discord bridge started afterwards on the same data dir, once the schedule comes due again, posts only the wait note (with the controls) to the schedule's channel and never the question, and DMs nothing.
- With no bot token, `daemon.started` has `ownerDm` `no-token`, the REST client is never called, `schedule_ask.dm_unavailable` (`no-token`) is logged once over two ticks, and the ask stays pending (`ask_posted_at` null).
- The `docs/DAEMON.md` Logs table has a row for every event the daemon logs, `schedule_ask.dm_error` included.

## Modified

### REQUIREMENT REQ-cli-098

`corvidinho doctor` SHALL always print a `spend` line (AUTONOMOUS-8 /
SAFE-8). Without `CORVIDINHO_DAILY_SPEND_CAP_USD` and
`CORVIDINHO_PROVIDER_SPEND_CAPS_USD` it SHALL be `info` and say no daily cap
is set, without opening the database; with provider caps only it SHALL say
no total daily cap is set, with no amount (`info`, or `warn` for an unpriced
model a provider cap covers). With the total cap set it
SHALL show spend in the last 24 hours against the daily cap with the percent,
the number of provider calls counted, and how many are still counted at their
estimate, and SHALL be marked `warn` at or past the 80% warning, at the cap,
when the cap value is not a plain USD amount, when the configured model has
no known price, or when the ledger cannot be read (the last three stop and
ask before every provider call). After it, doctor SHALL print one
`spend provider:<id>` line per provider cap (SAFE-14 / SAFE-15,
REQ-agent-114): that provider's 24-hour spend against its cap with the
percent, the calls counted and those still at their estimate, marked `warn`
at or past 80% and at the cap. When `CORVIDINHO_PROVIDER_SPEND_CAPS_USD` is
invalid (a malformed entry or a provider no configured model uses) the
`spend` line SHALL be `warn` and name the setting, never its value; every
provider call then stops and asks. A tier with no configured model (AGENT-10)
calls nothing, so it SHALL NOT count as an unpriced model: neither this line
nor the `/status` spend lines warn or say paused for it. The line SHALL be informational and SHALL
NOT change the doctor exit code. `task run` SHALL copy the run's 80% spend
warning onto `TaskResult.spendWarning` in `--json` output and the NDJSON
`result` frame, and a run stopped at the cap SHALL exit 0 with state
`blocked`; in text output it SHALL print the generic summary and the ask
question. `corvidinho daemon`, which has no Discord, SHALL log a `warn`
`spend.warning` line for a schedule run that crossed 80% of a cap (a
provider cap's `message` names its `provider:<id>` scope) and a `warn`
`run.needs_human` line with the ask reason for a run that stopped to ask,
leaving the recorded warning and the ask recorded on the run row pending for
a bridge to deliver (REQ-discord-347; AUTONOMY-2 / AUTONOMOUS-7). The daemon
SHALL NOT post the ask to a channel and still needs no Discord token
(REQ-cli-108); while no bridge runs on its data dir and it has a bot token
and an owner, it SHALL DM the ask to the owner and take it (AUTONOMOUS-7.a,
REQ-cli-707 / REQ-discord-707), and otherwise leave it pending for a bridge. `--help` and `.env.example` SHALL list both variables and say
each cap warns at 80% and stops and asks at 100%; for
`CORVIDINHO_PROVIDER_SPEND_CAPS_USD` they SHALL say it is a `provider=USD`
comma list keyed on the provider id (the endpoint host) and that a bad entry
or unknown provider stops every call.

Acceptance Criteria
- `bun src/cli.ts doctor` without the variable prints `[info] spend: no daily cap set (CORVIDINHO_DAILY_SPEND_CAP_USD)`.
- With `CORVIDINHO_DAILY_SPEND_CAP_USD=5` it prints `[ok] spend: $0.00 of $5.00 daily cap used in the last 24h (0%; 0 provider call(s)`.
- Invalid cap, unpriced model, 80% and cap reached yield a `warn` line with `ok: true`.
- `task run --json` against a localhost mock LLM carries `result.spendWarning` on the crossing run only, and at the cap returns `blocked` with a `spend-cap` ask, the generic summary and exit 0 without calling the mock; `--output text` at the cap prints the summary and the ask question.
- The daemon logs `spend.warning` (amounts and percent) and `run.needs_human` (`reason` `spend-cap`) as `warn` lines for a schedule run that reports them.
- A stuck schedule run the daemon claims logs `run.needs_human` (`reason` `stuck`), is recorded with its ask pending, and a Discord bridge started later on the same data dir posts it to the owner once.
- Under a cap with no model configured, `readSpendSnapshot` is `priced` and the public `/status` spend line is absent (not "paused for budget").
- With `CORVIDINHO_PROVIDER_SPEND_CAPS_USD=api.anthropic.com=2` and an Anthropic model, `doctor` prints `[info] spend: no total daily cap set (CORVIDINHO_DAILY_SPEND_CAP_USD)` and `[ok] spend provider:api.anthropic.com: $0.00 of $2.00 daily cap for api.anthropic.com used in the last 24h (0%; 0 provider call(s); CORVIDINHO_PROVIDER_SPEND_CAPS_USD, SAFE-14)`; a provider at 80% or at its cap is `warn`; an invalid provider setting is a `warn` `spend` line naming the setting and not its value.
- `--help` lists `CORVIDINHO_PROVIDER_SPEND_CAPS_USD`.
