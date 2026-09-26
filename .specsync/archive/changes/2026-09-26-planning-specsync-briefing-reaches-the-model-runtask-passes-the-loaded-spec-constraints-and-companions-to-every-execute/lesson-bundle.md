# Lesson bundle — planning-specsync-briefing-reaches-the-model-runtask-passes-the-loaded-spec-constraints-and-companions-to-every-execute

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Planning SpecSync briefing reaches the model: runTask passes the loaded spec constraints and companions to every execute attempt and the LLM user message carries them fenced as project data (AGENT-2, SPECSYNC-1/5)
- **Kind**: BugFix
- **Specs**: agent
- **Paths**: src/agent/loop.ts, src/agent/types.ts, src/agent/execute.ts, tests/agent.execute.test.ts
- **Acceptance**: task run with a registry and a matching module spec sends that spec's Invariants and companion files to the model on every attempt (tool loop and read tier), fenced as project data in the user message, secret-scrubbed and capped at 8000 chars; no match or no task text leaves the model messages unchanged

## Evidence

- Verification commit: `b29aba3e62d2ca3eebb0d29ce9cdac59e632c0c6`
- Base commit: `e8bbd215036e7dc8739ac9159afa19f17ae943c6`
- Verified by: `specsync check --spec agent`

## From the change's context.md

# Context

Bug agent-loop-3 (bug sweep). `runTask` loaded the Planning SpecSync briefing
(`loadRelevantSpecs`: Purpose / Invariants / Public API / Error Cases plus
`context.md` / `tasks.md` companions) and only emitted it as the
`Planning: SpecSync briefing` Text event. `ExecuteContext` had no field for it
and `createTaskExecute` built the user message from the task text and verify
feedback only, so the model never saw the spec constraints (AGENT-2,
SPECSYNC-1/5). On the read tier there are no tools, so the model had no way to
read the specs at all.

Repro before the fix: `task run --task "change billing retry logic"` in a
project with `.specsync/registry.toml` and `specs/billing/billing.spec.md`
sent `"Task:\nchange billing retry logic\n\nAttempt 1. Reply with a concise
status summary. Do not claim files were edited."` as the whole user message.

Constraints: spec files come from the working tree, which the non-dangerous
file tools can write, so the briefing stays out of the system prompt (the
AGENT-1 hardening keeps only committed AGENTS.md / CLAUDE.md there). It goes in
the user message, labelled and fenced as project data, SAFE-6 scrubbed and
capped at 8000 characters. No new env var, flag or event type.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-004` | `tests/agent.execute.test.ts` | `runTask` + `createTaskExecute` with a request-capturing fetch: read and tool tier user messages carry the billing Invariants and `context.md` companion, fenced and labelled, and the system message does not; both verify attempts get `ctx.specBriefing`; a non-matching task passes none and leaves the user message byte-identical; a vendor-key-shaped value is redacted, a planted closing tag cannot end the fence, and a 20k-char spec is truncated at 8000 chars. Failed before the fix (user message had only task + attempt line), pass after. |
| `REQ-agent-004` | `tests/agent.loop.test.ts` | Planning still emits the `Planning: SpecSync briefing` Text with `# Spec: agent`. |

## Where these lessons go

- `specs/agent/context.md`
