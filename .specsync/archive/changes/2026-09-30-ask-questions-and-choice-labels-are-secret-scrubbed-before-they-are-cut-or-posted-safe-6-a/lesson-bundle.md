# Lesson bundle — ask-questions-and-choice-labels-are-secret-scrubbed-before-they-are-cut-or-posted-safe-6-a

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Ask questions and choice labels are secret-scrubbed before they are cut or posted (SAFE-6.a)
- **Kind**: BugFix
- **Specs**: discord, agent
- **Paths**: hi/safe.md, INTENT.md, src/agent/ask.ts, src/agent/ask-options.ts, src/discord/ask-buttons.ts, tests/agent.ask.test.ts, tests/discord.ask-buttons.test.ts, tests/discord.ask-scrub-first.test.ts, tests/scheduler.ask-outbox.test.ts, docs/discord.md, specs/discord/discord.spec.md, specs/discord/testing.md, specs/agent/agent.spec.md, specs/agent/testing.md
- **Acceptance**: Each ask question (ASK_QUESTION_MAX 1500, normalizeQuestion) and choice label (80, cleanAskLabel) is SAFE-6 scrubbed before it is cut, and Discord option buttons scrub their labels before the 80-char cut; a question or label whose secret straddles the cut shows [redacted:<kind>] and never a raw piece shorter than the scrub pattern, in what is posted (Choose-pick buttons, the Answer stub and form, an ask restated after a restart, schedule ask posts) and what is stored (discord_sessions.pending_ask, schedule_runs.ask_question); option ids keep today's behaviour (a secret-looking id becomes its position, other ids byte-identical); regression tests fail on main and pass here; no new env var, config key, flag, command, data field, schema or scrub-rules version change

## Evidence

- Verification commit: `98cf7091e36198eb37c638564524b49299797378`
- Base commit: `c56ce4978bb7990e6064d6673aa60ba02267e056`
- Verified by: `specsync check --spec agent --spec discord`

## From the change's context.md

# Context

Leif's 2026-09-28 interview, round 12 (2026-09-29, M1/M2 rollup gaps): "Ask
labels (DISCORD-ASK / SAFE-6): scrub before cut — each ask question and
choice label is secret-scrubbed first, then cut; a label that held a secret
shows [redacted]; applies to what is posted and what is stored." Captured in
this PR with `hi` as SAFE-6.a "Ask questions and choice labels are scrubbed
for secrets before they are cut or posted." (parent SAFE-6).

The gap on `origin/main` `5aaf7f0`:

- `normalizeQuestion` (`src/agent/ask.ts`) cut the question at
  `ASK_QUESTION_MAX` (1500) with no scrub. Every later scrub (the stored
  `pending_ask`, `schedule_runs.ask_question`, the posts) ran on the cut
  text, so a key the cut split kept `ghp_` plus fewer than 20 raw characters,
  below the pattern's minimum, and was stored raw.
- `cleanLabel` (`src/agent/ask-options.ts`) cut each option label at 80 with
  no scrub, and `buildChoiceComponents` (`src/discord/ask-buttons.ts`)
  posted `label.slice(0, 80)` with no scrub at all: a label holding a whole
  key reached the Choose-pick buttons raw (only the stored row was
  scrubbed), and a split key stayed raw in the row and after a restart.

Constraints: bug fix with the new sub-criterion; smallest change; reuse
`scrubSecrets`; keep option ids as #265 left them (a secret-looking id
becomes its position); no env var, config key, flag, data field, schema or
scrub-rules version change; #232/#233 scope untouched.

## From the change's design.md

# Design

- `src/agent/ask.ts` `normalizeQuestion`: CRLF → LF, control characters
  dropped, 3+ newlines folded, trimmed (as before), then `scrubSecrets`,
  then the `ASK_QUESTION_MAX` cut with `…`. Cleaning runs before the scrub so
  a control character inside a key cannot hide it from the pattern.
  `normalizeAskAnswer` already scrubbed first; the second scrub is a no-op.
- `src/agent/ask-options.ts`: `cleanLabel` becomes the exported
  `cleanAskLabel` — whitespace collapsed, trimmed, `scrubSecrets`, then the
  80 cut with `…`. Every option `normalizeAskOptions` and
  `parseChoicesFromQuestion` return goes through it. Option ids are
  untouched (the #265 position fallback stays).
- `src/discord/ask-buttons.ts` `buildChoiceComponents`: each button label is
  `cleanAskLabel(o.label)` instead of `o.label.slice(0, 80)`, so a label
  that reached the buttons without `resolveAskOptions` is scrubbed before it
  is cut too; custom_ids keep the option id byte-identical.
- Scrub, cut, then scrub the cut text once more: a marker the cut itself
  falls inside is cut like other text (`[redacted:gith…`); the raw key never
  survives. The post-cut scrub (review fix) only matters when the cut ends a
  key shape: the one pattern anchored after the key is the AWS key id
  (`\b` after 16 characters), so `AKIA` plus a longer run of capitals is no
  key until a cut keeps exactly 16 of them before `…`. Its marker (18
  characters) is shorter than the id (20), so the text stays within its cap,
  and without it normalizing a stored ask again changed that label
  (REQ-agent-045) and the pick's ack showed the id while the button and the
  stored row were redacted. Any other match in the cut text would already
  have matched before the cut, so the second scrub never lengthens it.
- Stored rows: `pendingAskBody` and `storedAsk` keep their scrub as a
  backstop; they now see scrubbed text. Reloaded rows pass `askFromUnknown`,
  so they are scrubbed before they are cut too. No `SCRUB_RULES_VERSION`
  bump: a split piece already stored cannot be matched by any rule.

## From the change's testing.md

# Testing

With `origin/main`'s (`84b847a`; these three files are unchanged since
`5aaf7f0`) `src/agent/ask.ts`, `src/agent/ask-options.ts` and
`src/discord/ask-buttons.ts` swapped in, `bun test tests/agent.ask.test.ts
tests/discord.ask-buttons.test.ts tests/discord.ask-scrub-first.test.ts
tests/scheduler.ask-outbox.test.ts` gives 57 pass, 10 fail (the ten new
tests below); with this branch's files restored, 67 pass, 0 fail. Every
fixture key is built at runtime.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-045` (question scrubbed before the 1500 cut) | `tests/agent.ask.test.ts` | "a question whose secret straddles the ASK_QUESTION_MAX cut…": a fake `ghp_` key starting 24 chars before the cut comes out `…[redacted:github-token]…` (1500 chars) from `askFromToolArguments` and `askFromUnknown`, `formatAskSummary` holds no `ghp_`; a sweep of 66 cut positions leaves no `ghp_` and stays ≤1500. On main the question keeps `ghp_` + 19 raw chars. |
| `REQ-agent-045` (labels scrubbed before the 80 cut; ids as before) | `tests/agent.ask.test.ts` | "a choice label whose secret straddles the 80-char cut…": string options, `{id,label}` options and numbered lines give `…[redacted:github-token]…` (80 chars); a `ghp_` id becomes `2`, `use-new` is kept; a sweep of 85 positions leaves no `ghp_`. "a numbered choice cut by the question cap…": the second choice is `Use [redacted:github-token]…`. |
| `REQ-agent-045` (a cut that ends a key shape is scrubbed; normalizing again changes nothing) | `tests/agent.ask.test.ts` | "a cut that ends a key shape is scrubbed too…" (review fix): `AKIA` plus 20 capitals (no key id) placed so the cut keeps 16 gives `…[redacted:aws-key]…` for a label and a question, within the cap; `normalizeAskOptions` of the result and `askFromUnknown` of the question change nothing. Without the post-cut scrub the label keeps `AKIA` plus 16 capitals and a second normalize redacts it. |
| `REQ-discord-066` (posted Choose-pick buttons) | `tests/discord.ask-buttons.test.ts` | "buildChoiceComponents posts a label that held a secret…": whole key → `Use [redacted:github-token]`, straddling key → `…[redacted:github-token]…`, labels ≤80, custom_ids `cvask:pick:ask9:1..3`. "the ephemeral pick shows the scrubbed labels…": no `ghp_` in content or components. On main the buttons carry the raw key. |
| `REQ-discord-066` (chat ask: posted + stored) | `tests/discord.ask-scrub-first.test.ts` | "a choice label whose secret straddles the 80-char cut…": bridge on SQLite; `pending_ask` options `[{1, …[redacted:github-token]…}, {2, Neither}]`, the ephemeral buttons show the same, the pick's `humanText` is the redacted label, nothing posted holds `ghp_`. |
| `REQ-discord-066` (Answer stub + form, stored question) | `tests/discord.ask-scrub-first.test.ts` | "a free-text question whose secret straddles the 1500-char cut…": stored and pending question `…[redacted:github-token]…`; the Answer form opens; a thin reply restates without a run; nothing posted holds `ghp_`. |
| `REQ-discord-066` (restated after restart) | `tests/discord.ask-scrub-first.test.ts` | "after a restart the reloaded ask…": a second bridge on the same DB file reloads the ask with the redacted label and ids `1`/`2`; a stored label past the cut with the key across it loads as `…[redacted:github-token]…` (id `use-new` kept), a thin reply restates, the pick resumes with the redacted label. |
| `REQ-discord-066` (schedule ask stored + posted) | `tests/scheduler.ask-outbox.test.ts` | "SAFE-6.a: a question whose secret straddles the ASK_QUESTION_MAX cut…": `schedule_runs.ask_question` is `…[redacted:github-token]…` for a daemon-claimed stuck ask and a bridge-claimed clarify ask; the run summary and both posts hold no `ghp_`. |

## Automated coverage

- `bunx tsc --noEmit` — passed.
- `bun test` — see the change check record.
- `specsync check --require-coverage 100` — passed.
- `hi check` — passed.
- `fledge lanes run verify --non-interactive` — green (see the change check record).

## Where these lessons go

- `specs/discord/context.md`
- `specs/agent/context.md`
