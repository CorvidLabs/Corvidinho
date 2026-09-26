---
change: discord-memory-auto-recall-inject-on-spawn-plus-system-prompt-store-recall-rules-agent-7-memory-2-4-draft-67-behavior
artifact: plan
---

# Plan

1. Add `src/discord/memory-inject.ts` (format + enrich helpers).
2. Wire enrich into `src/discord/bridge.ts` before `agent.runChat`; log count.
3. Embed memory rules in `src/agent/execute.ts` system prompt; export constant.
4. Enrich `plugins/memory/commands.ts` descriptions + `src/agent/tools.ts` argv.
5. Fixture tests; SpecSync deltas REQ-discord-023 / REQ-agent-010 / REQ-plugins-085 / REQ-cli-014.
6. Bump package **0.0.7**; STATUS/CHANGELOG; verify; PR as corvid-agent; squash-merge; tag.
