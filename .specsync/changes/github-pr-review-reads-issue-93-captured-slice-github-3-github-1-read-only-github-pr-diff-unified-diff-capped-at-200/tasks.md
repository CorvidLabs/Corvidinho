---
change: github-pr-review-reads-issue-93-captured-slice-github-3-github-1-read-only-github-pr-diff-unified-diff-capped-at-200
artifact: tasks
---

# Tasks

- [x] Implement `github-pr-diff` / `github-pr-files` in `plugins/github/review.ts`
- [x] Register from `plugins/github/index.ts` (no edit to `commands.ts`)
- [x] 200 KiB cap with truncation marker; `--file PATH` filter; files pagination cap
- [x] SAFE-6 scrub before cap; untrusted-data label on payloads
- [x] Octokit-mocked fixture tests + plugins list smoke
- [x] Spec delta REQ-plugins-093 + spec `files:` coverage
- [x] Docs: `docs/WATCH.md`
- [x] Verify: specsync check, tsc, bun test, fledge verify
