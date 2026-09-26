---
change: discord-memory-auto-recall-inject-on-spawn-plus-system-prompt-store-recall-rules-agent-7-memory-2-4-draft-67-behavior
artifact: context
---

# Context

Leif dogfooded Discord MEMORY (channel 1408845298629083220): said "I am Leif"
(bot greeted but never called memory-store); asked "who am I" (memory-recall
returned empty for his user id at the time; bot claimed ignorance). Store and
plugins work — gap is Discord agent-loop behavior + empty owner scope + opaque
tool schemas. System prompt in `src/agent/execute.ts` never mentioned memory
tools; Discord spawn passed raw prompt only (no auto-inject). Seeded identity
for user `181969874455756800` now exists. HI captured: MEMORY-1..4,
MEMORY-ACL-1..5, AGENT-7. No `/memory` slash. Draft #67 "recall before claiming
ignorance" implemented as agent/prompt behavior under AGENT-7 / MEMORY-2/4
without inventing new HI ids. Version: 0.0.6 claimed by #81 → ship as **0.0.7**.
