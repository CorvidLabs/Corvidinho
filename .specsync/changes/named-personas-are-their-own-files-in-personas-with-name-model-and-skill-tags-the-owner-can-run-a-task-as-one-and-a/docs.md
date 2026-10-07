---
change: named-personas-are-their-own-files-in-personas-with-name-model-and-skill-tags-the-owner-can-run-a-task-as-one-and-a
artifact: docs
---

# Docs

- `README.md`: persona section says a named persona run uses its own voice; new
  "Named personas" paragraph (file format, model rule, who picks, delegate routing,
  loading and SAFE-2).
- `docs/DISCORD-GO-LIVE.md`: E.8 renamed "Persona file … and named personas", new named
  personas block; E.5 notes `delegate --skill` persona routing and that council voices keep
  the default voice.
- `docs/discord.md`: `/session start` row lists the optional owner-only `persona`.
- `src/cli.ts` `--help` / `TASK_RUN_USAGE`: `[--persona NAME]` with a one-line note.
- Specs: agent / cli / discord / plugins spec prose and files lists, module testing
  evidence, deltas (REQ-agent-225, REQ-agent-069 modified, REQ-cli-225, REQ-discord-225,
  REQ-plugins-225). No package bump, no CHANGELOG version section.
