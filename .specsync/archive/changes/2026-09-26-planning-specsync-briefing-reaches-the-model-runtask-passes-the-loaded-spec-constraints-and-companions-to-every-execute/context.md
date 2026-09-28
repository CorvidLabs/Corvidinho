---
change: planning-specsync-briefing-reaches-the-model-runtask-passes-the-loaded-spec-constraints-and-companions-to-every-execute
artifact: context
---

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
