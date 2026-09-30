---
change: fledge-lane-and-task-runs-start-without-my-github-or-git-credentials-like-the-shell-and-the-runners-now-that-my-talks
artifact: requirements
---

# Requirements

- SAFE-21.a (captured on main): "The shell and language runners start without
  my GitHub or git credentials, so pushes, PRs and merges only happen through
  the checked GitHub tools." Round 13 (2026-09-30) ties it to SAFE-3.a.
- SAFE-3.a (captured on main) offers the Fledge lane/task runs to the owner's
  own talks (#324).
- Modified: REQ-plugins-461 (the Fledge core builtins' child env gets
  `withoutGitCredentials`, the env of REQ-plugins-495). Nothing new captured;
  no env var, config key, flag or schema.
