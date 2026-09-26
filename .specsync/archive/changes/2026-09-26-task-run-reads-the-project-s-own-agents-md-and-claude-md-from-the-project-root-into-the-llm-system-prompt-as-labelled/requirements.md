---
change: task-run-reads-the-project-s-own-agents-md-and-claude-md-from-the-project-root-into-the-llm-system-prompt-as-labelled
artifact: requirements
---

# Requirements

- AGENT-1 (hi/agent.md, captured): works from the project's own config, not
  a global sandbox. Met here for AGENTS.md / CLAUDE.md at the project root.
- SAFE-6 (hi/safe.md): secrets never reach logs or providers; instruction
  text is scrubbed.
- SAFE-1 (hi/safe.md): project text cannot widen tool consent, allowlist or
  capability tier; the prompt label says so and the tool catalog is
  unchanged.
- New canonical requirement REQ-agent-084 (see deltas/agent.md).
- Left for HI capture: AGENT-13 (DRAFT) skills index and "check for a skill
  before refusing".
