---
change: discord-memory-auto-recall-inject-on-spawn-plus-system-prompt-store-recall-rules-agent-7-memory-2-4-draft-67-behavior
artifact: design
---

# Design

Pure inject helper mirrors DISCORD-9 `enrichPromptWithImages`: recall via existing
`MemoryStore.recall({ ownerUserId, limit: 20 })`, prepend block, leave ACL
unchanged. System prompt rules live in execute tool-loop (Discord spawns
`task run --no-verify --task <enriched>`). Tool description enrichment only —
no schema redesign beyond richer argv text for memory-*. No new HI ids; cite
AGENT-7 + MEMORY-2/4 for draft #67 "recall before claiming ignorance".
