---
change: tool-loop-dispatches-only-tools-offered-in-the-run-s-catalog-safe-1-agent-5-pr-128-review-follow-up-a-registered-but
artifact: context
---

# Context

PR #128 review (ACL-bypass lens) and an end-to-end probe showed the tool loop
passed any model-supplied tool name straight to `runPlugin`. Dangerous plugins
are left out of the offered catalog, but a model could still call them by
name, and Discord/WATCH spawns ran interactive so SAFE-1 never denied them.
The spawn side is fixed in the companion memory-hardening change; this change
closes the dispatch side in `src/agent/execute.ts`.
