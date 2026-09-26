---
change: github-write-plugins-for-assign-work-comment-pr-dogfood-issue-48-dangerous-github-issue-create-comment-github-pr-create
artifact: plan
---

# Plan

1. Extend `plugins/github/commands.ts` with four dangerous write commands + dry-run + attribution on PR create
2. Extend WATCH searcher/types for assignees → `assignment` events; fixture update
3. Tests: SAFE-1 deny, empty repo deny, dry-run happy paths, attribution, assignment in poller
4. Specs deltas for plugins + watch; STATUS + docs/WATCH.md
5. SpecSync approve/check/review/finalize; PR as corvid-agent; merge when green; comment #48
