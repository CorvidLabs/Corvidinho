---
change: github-7-typed-github-pr-merge-merges-the-bot-s-own-green-corvidinho-pr-only-when-ci-is-green-and-branch-protection
artifact: requirements
---

# Requirements

- **GITHUB-7** (hi/github.md): It may merge its own Corvidinho PR when verify
  and CI are green and branch protection, reviews and CODEOWNERS allow it; it
  never bypasses them, never merges someone else's PR, and outside Corvidinho
  a human still merges.
- **PROCESS-3 / PROCESS-4** (AGENTS.md): autonomous merge on Corvidinho;
  respect CODEOWNERS elsewhere.
- **GITHUB-5 / GITHUB-6 / SAFE-1**: dangerous write + allowlist + repo gate.
- **REQ-plugins-099**: typed `github-pr-merge` (see specs/plugins/requirements.md).
