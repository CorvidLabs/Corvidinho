---
change: planning-specsync-briefing-reaches-the-model-runtask-passes-the-loaded-spec-constraints-and-companions-to-every-execute
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-004` | `tests/agent.execute.test.ts` | `runTask` + `createTaskExecute` with a request-capturing fetch: read and tool tier user messages carry the billing Invariants and `context.md` companion, fenced and labelled, and the system message does not; both verify attempts get `ctx.specBriefing`; a non-matching task passes none and leaves the user message byte-identical; a vendor-key-shaped value is redacted, a planted closing tag cannot end the fence, and a 20k-char spec is truncated at 8000 chars. Failed before the fix (user message had only task + attempt line), pass after. |
| `REQ-agent-004` | `tests/agent.loop.test.ts` | Planning still emits the `Planning: SpecSync briefing` Text with `# Spec: agent`. |
