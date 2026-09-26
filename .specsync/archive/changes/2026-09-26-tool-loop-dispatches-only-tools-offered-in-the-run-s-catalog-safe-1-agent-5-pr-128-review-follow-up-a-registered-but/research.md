---
change: tool-loop-dispatches-only-tools-offered-in-the-run-s-catalog-safe-1-agent-5-pr-128-review-follow-up-a-registered-but
artifact: research
---

# Research

- `src/agent/tools.ts` `buildOpenAiTools` omits dangerous plugins unless
  `includeDangerous`; nothing sets it today.
- `src/plugins/run.ts` only denies dangerous plugins when non-interactive and
  not allowlisted.
