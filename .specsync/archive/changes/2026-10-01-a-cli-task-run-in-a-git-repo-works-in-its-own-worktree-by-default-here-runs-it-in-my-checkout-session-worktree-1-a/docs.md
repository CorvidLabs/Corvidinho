---
change: a-cli-task-run-in-a-git-repo-works-in-its-own-worktree-by-default-here-runs-it-in-my-checkout-session-worktree-1-a
artifact: docs
---

# Docs

- `README.md`: new "`task run` works in its own worktree
  (SESSION-WORKTREE-1.a)" section (default, `--here`, HEAD only, cleanup,
  fail-closed).
- `docs/DISCORD-GO-LIVE.md`: the SAFE-3.a paragraph no longer says a local
  run "runs in the current checkout"; the autonomous section says a local
  `task run` without `--here` also works in a worktree made from `HEAD`.
- `docs/discord.md`: the live-source paragraph names the spawn argv
  `task run --here --task <prompt> --output ndjson`.
- `src/cli.ts` help: `[--here]` on `task run` and three lines on the
  worktree default.
- Specs: `cli.spec.md` (files, Public API, constants, types, invariant,
  scenario, error rows, dependencies), `agent.spec.md` (Public API note),
  `discord.spec.md`, `watch.spec.md`, `plugins.spec.md` (spawn argv), and each
  module's `testing.md`.
- `AGENTS.md`'s bootstrap `task run` line stays right (it now runs in a
  worktree next to the checkout), so it is unchanged. No CHANGELOG / STATUS /
  package.json edit (the release PR writes them).
