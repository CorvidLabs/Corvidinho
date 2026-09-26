---
module: plugins
change: discord-memory-auto-recall-inject-on-spawn-plus-system-prompt-store-recall-rules-agent-7-memory-2-4-draft-67-behavior
---

# Delta — plugins (richer memory tool descriptions)

## Modified

### SPEC SECTION Invariants

Memory plugin command descriptions SHALL include concrete argv examples so the
LLM tool loop can call them (REQ-plugins-085). OpenAI tool schema argv text for
`memory-*` is enriched similarly in `buildOpenAiTools`.

### SPEC SECTION Behavioral Examples

### Scenario: memory-store description shows argv example

- **Given** builtins are loaded
- **When** an operator or the tool loop inspects `memory-store`
- **Then** the description includes `--category` / `person` / `identity` example argv

### SPEC SECTION Change Log

| 2026-09-26 | memory-discord-inject: richer memory-* argv descriptions (REQ-plugins-085) |

## Added

### REQUIREMENT REQ-plugins-085

`memory-store` / `memory-recall` (and forget/override) plugin descriptions SHALL
include concrete argv examples so models under-using opaque argv arrays can call
them. OpenAI tool schemas for `memory-*` SHALL enrich the argv property
description similarly.

Acceptance Criteria
- Descriptions mention `--category` / `--key` / `--query` examples.
- `buildOpenAiTools` memory-* argv description cites examples.
- Fixture tests assert description richness.
