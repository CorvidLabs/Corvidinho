---
change: planning-picks-spec-modules-from-the-request-not-the-bridge-wrapper-and-the-briefing-fence-and-cap-are-hardened
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-004` | `tests/agent.execute.test.ts` | "Discord identity/memory blocks do not select the discord module": a prompt built with `enrichPromptWithIdentity` + `formatMemoryInjectBlock` around "hi there, how are you?" passes no `specBriefing`; "the discord bridge drops replies" still gets `# Spec: discord` only. "a WATCH header does not select the watch module": a `[WATCH issue_comment]` run about a README typo passes none; one titled "watch poller skips events" gets `# Spec: watch`. "a spaced close tag in a spec cannot end the fence either" and "the 8000-char cut never leaves half a surrogate pair" check the user message sent to the model. All four failed on the PR #202 source and pass now. |
| `REQ-agent-004` | `tests/specLoader.test.ts` | "planningSelectionText drops bridge context, keeps the request": the Discord blocks are dropped, the `[WATCH …]` label is stripped while title and `[image: …]` text stay, and plain task text is unchanged. |
| `REQ-agent-004` | `tests/agent.execute.test.ts` | The PR #202 cases still pass: briefing in the user message (tool and read tier), every attempt, no briefing and unchanged message on no match, scrub, fence and cap. |
