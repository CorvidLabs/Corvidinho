---
change: tool-loop-dispatches-only-tools-offered-in-the-run-s-catalog-safe-1-agent-5-pr-128-review-follow-up-a-registered-but
artifact: requirements
---

# Requirements

1. `runToolLoop` SHALL only dispatch tool calls whose name is in the catalog it
   offered for this run (`buildOpenAiTools` output, tier + danger filtered).
2. Any other name SHALL produce a refused tool result (`ok: false`, "not
   offered") and SHALL NOT reach `runPlugin` — regardless of interactive mode
   or allowlist.
3. Offered tools behave exactly as before.
