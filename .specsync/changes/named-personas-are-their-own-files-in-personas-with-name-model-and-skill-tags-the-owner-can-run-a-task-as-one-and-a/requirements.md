---
change: named-personas-are-their-own-files-in-personas-with-name-model-and-skill-tags-the-owner-can-run-a-task-as-one-and-a
artifact: requirements
---

# Requirements

- **AUTONOMOUS-2** (hi/autonomous.md, on main): "I can define named personas with their own
  provider and skill tags and run as one of them."
  - **AUTONOMOUS-2.a** (captured in this PR): "persona.md stays the default voice; each
    named persona is its own file with its name, model, skill tags and voice in a personas
    folder."
- **AUTONOMOUS-5** (on main): "A lead agent can delegate subtasks to peers by skill and
  synthesize the result."
  - **AUTONOMOUS-5.a** (captured in this PR): "I can run a task as a named persona, and a
    lead run picks a persona by its skill tags; team members and the community can't pick
    personas."
- **PERSONA-2** (on main, stays true): "Its persona is one editable persona file, loaded
  every turn on every surface."
- Settled rules: specs only through SpecSync; owner admins, team works; v1 off-chain; ask at
  the spend cap (SAFE-8 per model); SAFE-2 for owner-edited config.
- REQ-agent-225 (added), REQ-agent-069 (modified), REQ-cli-225, REQ-discord-225,
  REQ-plugins-225 (added).
