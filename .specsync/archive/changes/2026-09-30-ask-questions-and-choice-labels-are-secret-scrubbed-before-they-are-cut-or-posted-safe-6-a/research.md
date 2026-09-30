---
change: ask-questions-and-choice-labels-are-secret-scrubbed-before-they-are-cut-or-posted-safe-6-a
artifact: research
---

# Research

- Every ask reaches Discord and the stores through `normalizeQuestion` and
  `resolveAskOptions`: the tool loop (`askFromToolArguments`), the spawn
  client's result frame (`askFromUnknown`, `src/discord/agent-client.ts`,
  used by chat, `/work`, `/session start` and schedules), and a stored ask on
  reload (`parsePendingAsk` → `askFromUnknown`, `src/discord/session-store.ts`).
  The bridge and slash handlers call `resolveAskOptions` again on the ask.
- Posting surfaces: the Choose stub carries no question or labels; the
  ephemeral pick (`formatAskEphemeralContent`, `clean` = scrub then cut at
  1200) and `buildChoiceComponents` (no scrub); the free-text/Answer post
  and restatements (`formatAskReply`, scrub then cut at 1200); the Answer
  form description (`buildAnswerModal`, scrub then cut at 100); schedule ask
  posts (`formatAskReply`). Their own caps already scrubbed first; the leak
  was the earlier 1500 / 80 cut and the unscrubbed button label.
- Stored surfaces: `pendingAskBody` scrubs question and labels (after the
  cut); `storedAsk` (`src/scheduler/store.ts`) scrubs then cuts, but on an
  already-cut question.
- Scrub pattern minimums: `ghp_` + 20, `sk-ant-` + 20, `sk-` + 20,
  `xoxb-` + 10, AWS 16 exact, Google 35, JWT 8/8/8 segments. With `ghp_`
  starting 24 characters before the cut, main keeps `ghp_` + 19 (missed);
  scrub-first leaves room for the whole 23-char marker.
- A stored partial piece cannot be found by a re-scrub (the pattern does not
  match it), so a `SCRUB_RULES_VERSION` bump would not help rows already
  written; the fix is at the point where text is cut.
