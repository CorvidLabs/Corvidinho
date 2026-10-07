---
module: agent
change: every-working-day-the-owner-and-each-teammate-get-a-short-briefing-dm-about-their-own-work-in-their-own-hours-and
---

# Delta: agent (the no-tools chat completion transport is exported for the daily briefing — COS-1)

## Added

### REQUIREMENT REQ-agent-102

`src/agent/execute.ts` SHALL export `chatCompletions` (and its result type
`Completion`) unchanged in behaviour: one OpenAI-compatible request to
`${provider.baseUrl}/chat/completions` with `model`, `messages` and
`temperature`, `tools` only when given, the bearer key only when the
provider has one, the caller's abort plus the per-request timeout, and the
same `Completion` result (`failure: null` for a SAFE-8 spend-cap stop or the
caller's own abort, so no model fallback routes around a cap). It is the
transport of the GITHUB-9 reviewer's no-tools call and of the daily briefing
composer (COS-1, REQ-discord-102), each through its own spend-capped fetch
(SAFE-8 / SAFE-14). No new tool, env var or config key.

Acceptance Criteria
- The briefing composer's call reaches the fake provider at `https://llm.test/v1/chat/completions` with the configured read-tier model and no `tools` key, and its reply becomes the briefing text (`tests/cos.briefing.test.ts`).
- With a spend cap of 0 the composer's call is never sent and comes back as a `spend-cap` stop, not a model failure (`tests/cos.briefing.test.ts`).
- The GITHUB-9 review tests that use the same call are unchanged (`tests/work.review.test.ts`).
