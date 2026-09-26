---
change: discord-memory-auto-recall-inject-on-spawn-plus-system-prompt-store-recall-rules-agent-7-memory-2-4-draft-67-behavior
artifact: requirements
---

# Requirements

### REQ-discord-023

When `memoryStore` is available, Discord HEAR spawn SHALL recall memories for
`msg.authorId` (limit ~20) and prepend a clear inject block to the agent prompt
before `agent.runChat` (AGENT-7 / MEMORY-2 / MEMORY-4). Empty scope SHALL still
include a one-liner nudging `memory-store`. Bridge SHALL log inject count.
No `/memory` slash.

Acceptance Criteria
- Inject helper formats `category/key: content` bullets under a fixed header.
- Empty recall → empty one-liner still prepended.
- Missing store / blank user → prompt unchanged (injected=false).
- Bridge logs `[discord] memory inject: N recalled for user …`.
- Fixture tests cover format + enrich (no live Discord).

### REQ-agent-010

The tool-loop system prompt SHALL instruct the model to (a) trust the injected
memory block, (b) call `memory-store` when the user states durable
identity/person/project facts, (c) call `memory-recall` before claiming
ignorance about the user/people/projects, (d) never invent memories
(AGENT-7 / MEMORY-2/4; draft #67 behavior).

Acceptance Criteria
- `MEMORY_AGENT_SYSTEM_INSTRUCTIONS` exported and embedded in tool-loop system.
- Fixture asserts trust / store / recall / never-invent phrases + argv example.

### REQ-plugins-085

`memory-store` / `memory-recall` (and forget/override) plugin descriptions SHALL
include concrete argv examples so models under-using opaque argv arrays can call
them. OpenAI tool schemas for `memory-*` SHALL enrich the argv property
description similarly.

Acceptance Criteria
- Descriptions mention `--category` / `--key` / `--query` examples.
- `buildOpenAiTools` memory-* argv description cites examples.
- Fixture tests assert description richness.

### REQ-cli-014

The project SHALL ship package version `0.0.7` with MEMORY Discord inject.
CLI `version` and Discord presence report `0.0.7` after bridge restart.
CHANGELOG SHALL include verbose 0.0.7 notes. STATUS.md SHALL record the slice.

Acceptance Criteria
- `package.json` / CLI version `0.0.7`.
- CHANGELOG 0.0.7 section; STATUS ROADMAP updated.
