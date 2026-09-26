---
change: tool-loop-dispatches-only-tools-offered-in-the-run-s-catalog-safe-1-agent-5-pr-128-review-follow-up-a-registered-but
artifact: design
---

# Design

`const offered = new Set(tools.map((t) => t.function.name))` in
`runToolLoop`; dispatch `runPlugin` only when `offered.has(name)`, else a
synthetic refused result. The refusal is fed back to the model as a normal
tool message so the loop continues.
