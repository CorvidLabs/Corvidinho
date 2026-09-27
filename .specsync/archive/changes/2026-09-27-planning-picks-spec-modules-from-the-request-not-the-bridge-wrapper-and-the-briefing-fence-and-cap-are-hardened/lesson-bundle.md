# Lesson bundle — planning-picks-spec-modules-from-the-request-not-the-bridge-wrapper-and-the-briefing-fence-and-cap-are-hardened

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Planning picks spec modules from the request not the bridge wrapper, and the briefing fence and cap are hardened
- **Kind**: BugFix
- **Specs**: agent
- **Paths**: src/agent/specLoader.ts, src/agent/execute.ts, tests/agent.execute.test.ts, tests/specLoader.test.ts
- **Acceptance**: A Discord chat whose request names no module gets no SpecSync briefing even though the identity and memory blocks say Discord, and a WATCH run whose header says WATCH gets no watch briefing; a request that names a module still gets its briefing; a spaced close tag such as </ specsync-briefing > in a spec cannot end the fence; the 8000-char cap never leaves half a surrogate pair

## Evidence

- Verification commit: `08babaffa379b4a0d79ed03a3bc7d6c5af64ef6f`
- Base commit: `984332fba8490435d9d3da4fcdb29a10e42d857e`
- Verified by: `specsync check --spec agent`

## From the change's context.md

# Context

Adversarial review of PR #202 (Planning SpecSync briefing reaches the model,
REQ-agent-004). That PR made the Planning briefing part of the LLM user
message on every attempt. Planning picks modules by token overlap with the
whole task text, and the bridges wrap the human's request in context:

- Discord: the memory block (`[Corvidinho memory for this Discord user …]`)
  and the identity block (`[Corvidinho acting Discord user …]`,
  `- discord_user_id: …`) are prepended to every chat.
- WATCH: every run starts with `[WATCH <kind>] <repo>#<n> by @<sender>`.

In this repository (modules agent, cli, discord, plugins, watch) that meant a
Discord "hi there" selected `discord` and every WATCH run selected `watch`.
Before PR #202 this only showed in the Planning Text event; after it, every
Discord chat and WATCH run sent about 8000 extra characters of an unrelated
spec to the model, on every tool round and every attempt.

Two smaller gaps in the same PR: the fence escape only matched the exact
`</specsync-briefing` form (`</ specsync-briefing >` still reads as a close
tag), and the 8000-char cut could end on the high half of a surrogate pair,
which puts a lone surrogate (not valid Unicode) in the request body.

Constraints: no new env var, flag, event type or product surface; the fix
stays inside the agent module. Captured HI: AGENT-2, SPECSYNC-1/5, SAFE-6.

## From the change's design.md

# Design

- `planningSelectionText(task)` in `src/agent/specLoader.ts`: drop every
  paragraph whose first line starts with `[Corvidinho ` (Corvidinho's own
  injected context blocks), then strip an all-caps bracket label at the start
  of a line (`[WATCH issue_comment]`). Lower-case brackets such as
  `[image: …]` are the human's own message and still count.
- `loadRelevantSpecs` selects on that text. Reading, extraction, companions
  and the briefing text itself are unchanged; so is the Planning Text event.
- `renderSpecBriefing` escapes any `<\s*/\s*specsync-briefing` (any case or
  spacing) and, when the cut would end on a high surrogate, cuts one char
  earlier.
- The agent module does not import the discord or watch modules; the
  `[Corvidinho ` prefix is the shared convention of the injected headers.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-004` | `tests/agent.execute.test.ts` | "Discord identity/memory blocks do not select the discord module": a prompt built with `enrichPromptWithIdentity` + `formatMemoryInjectBlock` around "hi there, how are you?" passes no `specBriefing`; "the discord bridge drops replies" still gets `# Spec: discord` only. "a WATCH header does not select the watch module": a `[WATCH issue_comment]` run about a README typo passes none; one titled "watch poller skips events" gets `# Spec: watch`. "a spaced close tag in a spec cannot end the fence either" and "the 8000-char cut never leaves half a surrogate pair" check the user message sent to the model. All four failed on the PR #202 source and pass now. |
| `REQ-agent-004` | `tests/specLoader.test.ts` | "planningSelectionText drops bridge context, keeps the request": the Discord blocks are dropped, the `[WATCH …]` label is stripped while title and `[image: …]` text stay, and plain task text is unchanged. |
| `REQ-agent-004` | `tests/agent.execute.test.ts` | The PR #202 cases still pass: briefing in the user message (tool and read tier), every attempt, no briefing and unchanged message on no match, scrub, fence and cap. |

## Where these lessons go

- `specs/agent/context.md`
