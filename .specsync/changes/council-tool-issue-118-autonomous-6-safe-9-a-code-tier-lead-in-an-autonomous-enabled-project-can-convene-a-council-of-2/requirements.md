---
change: council-tool-issue-118-autonomous-6-safe-9-a-code-tier-lead-in-an-autonomous-enabled-project-can-convene-a-council-of-2
artifact: requirements
---

# Requirements

| REQ | Summary | HI |
|-----|---------|----|
| REQ-agent-118 | Council core: propose, critique, decide over delegate-core workers; read-tier, non-ADMIN, empty-allowlist voices; at most 2 at once; scrubbed, capped entries; per-voice and council time caps; no confidence score | AUTONOMOUS-6, SAFE-6, ROLES-CHAT-2/3 |
| REQ-plugins-118 | `council` plugin: dangerous=false, mutating=true, minTier=2, autonomous=true; gates re-checked (usage, AUTONOMOUS-1, depth, code tier, budget); result data carries the decision and transcript | AUTONOMOUS-1, AUTONOMOUS-6, SAFE-9, PLUGIN-2/5/6 |

Left for HI capture: draft AUTONOMOUS-11 (a multi-model council with a
confidence score).
