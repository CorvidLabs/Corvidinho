---
change: my-local-cli-task-run-may-use-the-allowlisted-shell-and-runners-inside-its-own-worktree-safe-3-a-local-cli-half
artifact: docs
---

# Docs

- `src/cli.ts` help: one line under `task run` (the shell, runners and Fledge
  runs only in the new worktree, never with `--here`, SAFE-3.a).
- `README.md`: a paragraph in "`task run` works in its own worktree"
  (allowlist + code tier, not with `--here` / non-git / subdirectory, the one
  operator line, the card lapses with no bridge).
- `docs/DISCORD-GO-LIVE.md`: the dangerous-tool intro and the
  `shell-exec` / runners / Fledge rows, the E.3 SAFE-3.a bullet (the local
  run's own worktree replaces "does not get them yet"; a lapsed card with no
  bridge), E.6 local CLI bullet.
- `docs/discord.md`: the roles bullet names the local run's own worktree.
- `STATUS.md`: the remaining-gaps line no longer says a local run does not
  get them (the 0.0.37 release row is history and stays).
- `src/agent/tools.ts`: the `SAFE3A_TOOLS` doc comment.
- Specs: `agent.spec.md` (Public API, wiring paragraph, invariant, scenario,
  error row), `cli.spec.md` (files list, invariant paragraph, scenario, error
  row, dependencies) and both `testing.md`.
- No CHANGELOG / package.json edit (the release PR writes them).
