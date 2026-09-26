---
change: task-run-reads-the-project-s-own-agents-md-and-claude-md-from-the-project-root-into-the-llm-system-prompt-as-labelled
artifact: context
---

# Context

Issue #84 asks Corvidinho to follow each repo's own rules before acting. The
captured HI is AGENT-1 (hi/agent.md): "I can give Corvidinho a task in a
project folder and it works from that project's own config and tools, not
from some global sandbox of its own." Before this change the `task run`
system prompt was the same fixed Corvidinho text in every project, so a
project's AGENTS.md / CLAUDE.md never reached the model.

AGENT-13 in the issue (read skills, check for a skill before refusing) is
DRAFT, not captured, so skills and the "look up a skill before refusing"
rule are left for HI capture. The issue's scope note about also reading the
"nearest parent" is part of that draft shape; this slice reads only the
project root.

Many workers edit src/agent/execute.ts in parallel, so the logic lives in a
new module and execute.ts gets small hooks only.
