---
change: github-7-typed-github-pr-merge-merges-the-bot-s-own-green-corvidinho-pr-only-when-ci-is-green-and-branch-protection
artifact: plan
---

# Plan

1. Add `plugins/github/merge.ts` (`mergeOwnGreenPr`, Corvidinho slug check,
   own-author, CI green, mergeable, `pulls.merge` no admin).
2. Wire dangerous `github-pr-merge` in `plugins/github/commands.ts`.
3. Fixture tests in `tests/github.merge.plugin.test.ts`; smoke list update.
4. Specs (plugins.spec + requirements REQ-plugins-099 + testing), docs
   (DISCORD-GO-LIVE), STATUS, CHANGELOG Unreleased; SpecSync delta.
5. `specsync change approve` → check → verify lane → PR as corvid-agent.
