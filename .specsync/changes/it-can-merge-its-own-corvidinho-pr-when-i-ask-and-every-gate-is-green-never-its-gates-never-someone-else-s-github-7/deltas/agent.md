---
module: agent
change: it-can-merge-its-own-corvidinho-pr-when-i-ask-and-every-gate-is-green-never-its-gates-never-someone-else-s-github-7
---

# Delta: agent (github-pr-merge offered only in the owner's own interactive run, GITHUB-7.a)

## Added

### REQUIREMENT REQ-agent-099

GITHUB-7.a "only when I ask" in the tool loop: `SELF_MERGE_TOOLS`
(`src/agent/tools.ts`, `github-pr-merge`) SHALL be offered by
`buildOpenAiTools` only with `selfMerge: true` (or the `includeDangerous`
test seam), on top of the SAFE-1 allowlist, the role filter (never team or
community, IDENTITY-9..11) and the tier. `createTaskExecute` SHALL, for every
attempt whose allowlist names it, set `selfMerge` from
`selfMergeCallerRefusal(env)` (REQ-plugins-099: the owner's chat,
`/session start`, `/work` or an ask answer of one, or the local CLI nothing
spawned — never WATCH, the owner's own GitHub-triggered run included, a
schedule, a worker or a non-owner) and, the first
time it is held back in a run, emit one operator `Text` line
`[operator] GITHUB-7.a: github-pr-merge allowlisted but not offered: <why>`
(never reply text). `STATE_CHANGING_TOOLS` (`src/agent/loop-guards.ts`)
SHALL include `github-pr-merge`, so a merge counts as a change (AGENT-16 /
AGENT-17).

Acceptance Criteria
- `buildOpenAiTools` offers an allowlisted `github-pr-merge` to the owner and to no role session only with `selfMerge`, never to team (even in `/work`) or community, never unallowlisted and never at read tier.
- Through `createTaskExecute` the owner's chat is offered it; WATCH (a WATCH session id on the owner's chat stamp, and the owner's own GitHub-triggered run as the WATCH spawn stamps it), the owner's own schedule and a team chat are not, each with one `[operator] GITHUB-7.a:` line.
- Every dangerous or mutating builtin is still in exactly one of `STATE_CHANGING_TOOLS` / `NO_STATE_CHANGE_TOOLS`.

## Modified

### REQUIREMENT REQ-agent-097

Anything else inside its guardrails, it just does and tells me (AUTONOMY-11,
captured on main from Leif's 2026-09-28 interview).
`ASK_AGENT_SYSTEM_INSTRUCTIONS` (`src/agent/ask.ts`, in every tool-loop
system prompt) SHALL carry one sentence: anything inside its guardrails it
just does and then says what it did, because only prod or deploy contact,
channel posts and merging its own PR (GITHUB-7.a) need the owner's OK and the
tool itself waits for it on the Approve card (REQ-plugins-097) — so it never calls `ask-human` for
permission first and never repeats a call the owner denied. A must-ask
call's refusal (deny, lapse, worker, no owner) reaches the model as that
tool's result like any refusal; the loop is otherwise unchanged. While a call
waits, the live status SHALL say so: `progressFromFrame`
(`src/agent/events-ndjson.ts`) SHALL map a `Text` frame that starts with the
gate's wait line (`[operator] AUTONOMY-<n>: waiting for the owner's OK on an
Approve card`, or `[operator] GITHUB-7.a: …` for the self-merge card,
`MUST_ASK_WAIT_TEXT_RE`) to the message `MUST_ASK_WAIT_STATUS`
("waiting for the owner's OK on an Approve card"), which the Discord thinking
status shows; every other `Text` frame SHALL still change nothing shown.

Acceptance Criteria
- `ASK_AGENT_SYSTEM_INSTRUCTIONS` contains the "Must-ask (AUTONOMY-9..11)" sentence and the tool loop's system message holds it.
- In one round a `files-write` runs with no card while a `discord-post-message` waits for the card; the owner's no reaches the model as `refused (AUTONOMY-10) … the owner denied it`.
- `progressFromFrame` shows the gate's wait line as "waiting for the owner's OK on an Approve card" and any other `Text` frame as nothing.
- The self-merge card's wait line (`[operator] GITHUB-7.a: waiting for the owner's OK on an Approve card with the one-time code …`) maps to the same status (`tests/github.self-merge.test.ts`).
