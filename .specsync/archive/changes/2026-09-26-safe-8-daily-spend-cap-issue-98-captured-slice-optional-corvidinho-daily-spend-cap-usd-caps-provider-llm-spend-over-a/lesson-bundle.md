# Lesson bundle — safe-8-daily-spend-cap-issue-98-captured-slice-optional-corvidinho-daily-spend-cap-usd-caps-provider-llm-spend-over-a

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: SAFE-8 daily spend cap (issue #98 captured slice): optional CORVIDINHO_DAILY_SPEND_CAP_USD caps provider (LLM) spend over a rolling 24h; each OpenAI-compatible call is priced from a per-model table, reserved against a spend_ledger in the shared SQLite DB before it is sent and refused with a clear error when it would break the cap, then settled from provider-reported token usage; unpriced models are refused while a cap is set; no cap means no behavior change; doctor shows spend vs the cap (AUTONOMOUS-8); ledger provider/model columns are SAFE-6 scrubbed; draft SAFE-14..16 (80% warn, per-provider caps, ask at 100%) left for HI capture
- **Kind**: Feature
- **Specs**: agent, cli, discord
- **Paths**: src/agent/spend.ts, src/agent/execute.ts, src/agent/index.ts, src/cli.ts, src/store/scrub.ts, tests/agent.spend.test.ts, .env.example, specs/agent/, specs/cli/, specs/discord/
- **Acceptance**: With CORVIDINHO_DAILY_SPEND_CAP_USD unset the provider fetch is untouched and no ledger/DB is opened; with it set, each OpenAI-compatible call is priced from the per-model table and its estimate (request bytes/3 prompt tokens + 4096-token reply reserve) is reserved in spend_ledger inside one IMMEDIATE transaction, and the call is refused before sending (SpendCapRefusal, clear message naming spent, estimate, cap and env var; surfaced as the task summary) when 24h spend + estimate would exceed the cap; the reservation settles to the provider-reported usage cost (actual), stays at the estimate when usage is missing or the request errored at the network, and drops to 0 on an HTTP error reply; spend older than 24h no longer counts; an unpriced model or an invalid cap refuses every call (never free, fail closed); spend_ledger provider/model are scrubSecrets-ed and in SCRUB_TARGETS; doctor prints a spend line (spend vs cap, calls, estimated calls, unpriced-model warning) only when a cap is set and never fails doctor; fixture tests with mocked fetch, no network

## Evidence

- Verification commit: `09490b0cac74c7292da3581adf57529101ddc50c`
- Base commit: `3429ddd55c8a26e3f68e25defb953a010dab524f`
- Verified by: `specsync check --spec agent --spec cli --spec discord`

## From the change's context.md

# Context

Issue #98 (P2, M4 Safe autonomy, build step 4 of 7 in tracker #124). Today a
task run with an LLM key calls the provider as often as the tool loop wants;
nothing stops a runaway loop or a busy Discord channel from quietly running
up the bill.

Captured HI this change meets:

- **SAFE-8**  When a daily spend cap is set, provider calls that would break
  it are refused instead of quietly running up the bill.
- **AUTONOMOUS-8**  I can see credit/spend usage for autonomous runs against a
  budget I set (slice: a `doctor` line; spawned Discord/WATCH runs share the
  same ledger because they inherit the bridge env).

Not captured (left for HI capture, not implemented):

- Draft **SAFE-14** (rolling 24 h cap per provider and one for the total).
- Draft **SAFE-15** (warn at 80 %, stop and ask at 100 %). Leif's issue
  comment decides "ask at 100 %" and asks to amend SAFE-8, but hi/safe.md
  still says "refused"; this change builds the captured wording. Refusal is
  also the only safe answer for headless runs until an approval card (#96)
  exists.
- Draft **SAFE-16** (unknown price counted and shown as unknown). This change
  never counts an unpriced model as free: it refuses it while a cap is set.
- Caps set from Discord admin, the Discord footer (#75), `/status`,
  dashboard and briefing views, AlgoChat fees, councils/subagents.

Constraints:

- No cap set means no behavior change (no DB open, fetch untouched).
- SQLite: origin/main is at SCHEMA_VERSION 5 and #142 may take v6, so the
  ledger table is created by its own module with CREATE TABLE IF NOT EXISTS
  and no version bump.
- Free-text columns go through scrubSecrets and SCRUB_TARGETS (SAFE-6).
- Keep hot shared files (execute.ts, cli.ts) to small hooks.

Amended before finalize (lesson):

- Leif amended SAFE-8 on #98 (captured by #162): warn at 80%, and at 100%
  ask (Approve card) instead of refusing. The refusal behavior above was
  replaced in the same PR by the follow-up change
  `safe-8-amended-issue-98-warn-at-80-of-the-daily-spend-cap-and-ask-at-100-instead-of-refusing-once-per-crossing-a-run`
  (ordered after this one), which modifies REQ-agent-098 / REQ-cli-098 /
  REQ-discord-098. Once that change materialized, this change's original
  `## Added` text no longer matched the living tree and could not
  re-verify, so its deltas now carry the amended text (re-approved). The
  ledger, price table and estimates described above are unchanged; only the
  at-cap behavior (stop and ask, run `blocked`), the 80% warning and the
  doctor / `/status` lines differ.

## From the change's design.md

# Design

## New module `src/agent/spend.ts` (agent spec)

- Knob: `CORVIDINHO_DAILY_SPEND_CAP_USD` (env). No existing config fits: the
  provider is configured only through env (`CORVIDINHO_LLM_*`), the cap is
  per box/operator rather than per project (fledge.toml `[corvidinho]` is per
  project), and bridge-spawned agents inherit the bridge env. Unset/blank =
  off; a plain USD amount (`5`, `2.50`, `.5`) = cap; anything else = invalid,
  so every provider call is refused (fail closed; the value is never echoed).
- "Daily" = rolling 24 h (`SPEND_WINDOW_MS`), no midnight reset burst.
- Price table `MODEL_PRICES_USD_PER_MTOK`: standard USD per 1M input/output
  tokens for common OpenAI and Anthropic (OpenAI-compatible endpoint) models,
  exact id match (trimmed, lower-cased). Cached-input discounts are ignored
  (errs high). Money is integer micro-USD (USD/MTok x 1000 = nano-USD per
  token, cost rounded up to micro-USD), so there is no float drift.
- Unpriced model while a cap is set: refused. Counting it as free would defeat
  the cap; guessing a ceiling price would report made-up spend. Remedy is a
  priced model or no cap. (Draft SAFE-16 covers showing unknown spend.)
- `SpendLedger` over table `spend_ledger` (id, ts, provider, model, status,
  estimate_micro_usd, cost_micro_usd, prompt/completion tokens, settled_at;
  index on ts). `reserve` checks window spend + estimate against the cap and
  inserts a `reserved` row inside one IMMEDIATE transaction, so concurrent
  bridge-spawned processes cannot both squeeze under the cap. `settle`:
  `actual` (provider usage cost), `estimated` (usage missing or unreadable, or
  network error / abort, which may have been billed), `failed` (HTTP error
  reply, cost 0). A crashed process leaves its reservation counted.
- Estimate before the call: UTF-8 request bytes / 3 prompt tokens + 4096 reply
  tokens at the model's prices. A reply longer than the reserve can overshoot
  the cap by that one call; the next call is refused.
- Usage reporting only `total_tokens` counts the unsplit remainder at the
  output (higher) rate.
- `withSpendCap(fetch, { env, readUsage })` returns `fetch` itself when off;
  otherwise a wrapper that refuses by throwing `SpendCapRefusal` before any
  request is sent, reads usage from a clone of the reply, and settles.
- `spendDoctorCheck({ env, model })`: null when off; else
  `{ ok: true, mark, detail }` with spend vs cap, calls, calls counted at their
  estimate, and a warn mark for an invalid cap or an unpriced configured
  model. Informational: never fails doctor (the box update script rolls back
  on a failing doctor).

## Hooks

- `src/agent/execute.ts`: `createTaskExecute` wraps its fetch with
  `withSpendCap(opts.fetchImpl ?? fetch, { env, readUsage: extractUsage })`.
  The refusal surfaces through the existing `LLM request failed: ...` path as
  the task summary (Discord/WATCH post it).
- `src/cli.ts`: doctor pushes the spend line when present; help lists the env.
- `src/store/scrub.ts`: `SCRUB_TARGETS` gains `spend_ledger` provider/model.
- `src/agent/index.ts`: re-exports.

## From the change's testing.md

# Testing

- `tests/agent.spend.test.ts`:
  - `parseSpendCap`: unset/blank off; plain amounts to micro-USD; `abc`, `-1`,
    `$5`, `1e3`, `Infinity`, `5 USD`, `1,5` invalid.
  - Pricing: exact ids, case-insensitive; dated / unknown / prototype ids
    unpriced; integer micro-USD cost rounded up; total-only usage at the output
    rate; estimate formula; `formatUsd`.
  - `withSpendCap`: no cap returns the same fetch and creates no DB file;
    under the cap the call goes through, the caller still reads the body, and
    the ledger row settles to actual usage cost; over the cap refuses before
    sending; spend older than 24 h does not count; zero cap refuses; unpriced
    model refused without touching the ledger; invalid cap refused without
    echoing the value; HTTP error counts 0, missing usage and network error
    keep the estimate; two DB connections on one file see each other's
    reservations.
  - SAFE-6: provider/model persist scrubbed; `SCRUB_TARGETS` lists them;
    `rescrubDatabase` re-scrubs raw rows.
  - `createTaskExecute`: a run with cap 0 never calls fetch and the summary
    names the refusal; a run under the cap records spend that
    `spendDoctorCheck` reports.
  - `spendDoctorCheck`: null when off; warn for invalid cap / unpriced model;
    estimated calls shown.
  - Real `bun src/cli.ts doctor`: no spend line without a cap; `[ok] spend:`
    line with one.
- No network, no real keys, no worktrees.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-098` | `tests/agent.spend.test.ts` | Cap parsing, pricing, reserve/refuse/settle, 24 h window, unpriced/invalid refusal, shared-file reservation, createTaskExecute hook. |
| `REQ-cli-098` | `tests/agent.spend.test.ts` | Real `doctor` prints the spend line only with a cap; `spendDoctorCheck` warn cases. |
| `REQ-discord-098` | `tests/agent.spend.test.ts` | Ledger provider/model scrubbed on write, listed in `SCRUB_TARGETS`, re-scrubbed by `rescrubDatabase`. |

## Automated coverage

- `bunx tsc --noEmit`
- `bun test`
- `specsync check --require-coverage 100`
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/agent/context.md`
- `specs/cli/context.md`
- `specs/discord/context.md`
