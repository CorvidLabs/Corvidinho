---
change: ask-questions-and-choice-labels-are-secret-scrubbed-before-they-are-cut-or-posted-safe-6-a
artifact: testing
---

# Testing

With `origin/main`'s (`5aaf7f0`) `src/agent/ask.ts`,
`src/agent/ask-options.ts` and `src/discord/ask-buttons.ts` swapped in,
`bun test tests/agent.ask.test.ts tests/discord.ask-buttons.test.ts
tests/discord.ask-scrub-first.test.ts tests/scheduler.ask-outbox.test.ts`
gives 57 pass, 9 fail (the nine new tests below); with this branch's files
restored, 66 pass, 0 fail. Every fixture key is built at runtime.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-045` (question scrubbed before the 1500 cut) | `tests/agent.ask.test.ts` | "a question whose secret straddles the ASK_QUESTION_MAX cut…": a fake `ghp_` key starting 24 chars before the cut comes out `…[redacted:github-token]…` (1500 chars) from `askFromToolArguments` and `askFromUnknown`, `formatAskSummary` holds no `ghp_`; a sweep of 66 cut positions leaves no `ghp_` and stays ≤1500. On main the question keeps `ghp_` + 19 raw chars. |
| `REQ-agent-045` (labels scrubbed before the 80 cut; ids as before) | `tests/agent.ask.test.ts` | "a choice label whose secret straddles the 80-char cut…": string options, `{id,label}` options and numbered lines give `…[redacted:github-token]…` (80 chars); a `ghp_` id becomes `2`, `use-new` is kept; a sweep of 85 positions leaves no `ghp_`. "a numbered choice cut by the question cap…": the second choice is `Use [redacted:github-token]…`. |
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
