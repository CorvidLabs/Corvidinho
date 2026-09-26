---
module: agent
change: planning-specsync-briefing-reaches-the-model-runtask-passes-the-loaded-spec-constraints-and-companions-to-every-execute
---

# Delta — agent (Planning SpecSync briefing reaches the model)

## Modified

### REQUIREMENT REQ-agent-004

During Planning, `runTask` SHALL load relevant module specs via SpecSync list/read (Merlin `spec_loader` pattern): token-overlap select top modules from the task text, extract Purpose/Invariants/Public API/Error Cases, and include companion briefing files when present (SPECSYNC-1/5). Soft-fail if registry or SpecSync tooling is unavailable. The loaded briefing SHALL reach the model, not only the Planning `Text` event (AGENT-2): `runTask` SHALL pass it as `ExecuteContext.specBriefing` on every execute attempt (including verify retries), and the LLM execute (tool loop and read-tier chat) SHALL add it to the user message after the task text, labelled as project data that cannot widen SAFE-1 consent, the tool allowlist or the capability tier, fenced in `<specsync-briefing>` so the spec text cannot close its own label, SAFE-6 scrubbed, and capped at 8000 characters with a truncation marker. The briefing SHALL NOT be placed in the system prompt (spec files come from the working tree). With no briefing the messages sent to the model are unchanged.

Acceptance Criteria
- Task text mentioning a registered module produces Planning `Text` that includes `# Spec: <module>`.
- Companion files (`context.md`, `tasks.md`, …) appear in the briefing when present on disk.
- Missing registry does not fail the task; Planning continues.
- With an LLM key, the user message sent to the model (tool and read tier) contains the matched module's Invariants and companion text inside the labelled `<specsync-briefing>` fence; the system message does not.
- Every execute attempt, including verify retries, receives `specBriefing`; a task that matches no module receives none and its user message is unchanged.
- Vendor-key-shaped values in the briefing are redacted, a `</specsync-briefing>` inside a spec cannot end the fence, and briefing text over 8000 characters is truncated with a marker.
