---
id: discord-memory-auto-recall-inject-on-spawn-plus-system-prompt-store-recall-rules-agent-7-memory-2-4-draft-67-behavior
state: verifying
type: feature
base_commit: c3b4d8881ea2d9a5b968eb47b9eda35c6e1b2233
---

# Discord MEMORY auto-recall inject on spawn plus system-prompt store/recall rules (AGENT-7 MEMORY-2/4 draft #67 behavior) package 0.0.7

## Intent

Discord MEMORY auto-recall inject on spawn plus system-prompt store/recall rules (AGENT-7 MEMORY-2/4 draft #67 behavior) package 0.0.7

## Affected Canonical Specs

- `discord`
- `agent`
- `plugins`
- `cli`

## Acceptance Criteria

- Discord spawn prepends recalled memories (limit ~20) for msg.authorId before runChat; empty scope still gets empty one-liner; bridge logs inject count; system prompt instructs trust inject / memory-store on durable facts / memory-recall before claiming ignorance / never invent; memory-* tool descriptions include argv examples; fixture tests green; package 0.0.7; no /memory slash; cites AGENT-7 MEMORY-2/4 (draft #67 behavior)

## No-spec Rationale

Not applicable
