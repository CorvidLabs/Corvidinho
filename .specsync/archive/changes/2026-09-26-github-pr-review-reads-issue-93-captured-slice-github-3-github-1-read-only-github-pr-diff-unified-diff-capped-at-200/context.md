---
change: github-pr-review-reads-issue-93-captured-slice-github-3-github-1-read-only-github-pr-diff-unified-diff-capped-at-200
artifact: context
---

# Context

Issue #93 (M3 Real dev teammate): `github-pr-review` (#48) can post a review,
but nothing reads the diff, so today a human pastes the patch into chat.
Captured HI `hi/github.md` **GITHUB-3** ("read a PR diff, comment, and submit a
review without me pasting the patch into chat") and **GITHUB-1** ("through
reviewed tools rather than improvised shell") cover the read half.

Captured slice only. Issue #93 also proposes **GITHUB-10** (0-100 confidence
score + "what it checked / couldn't") — that id is **DRAFT** pending Leif's
confirmation in `hi/` (PROCESS-1), so it is not built here and is left for HI
capture. Inline review comments and team review requests are also outside this
slice.

Constraint: a parallel worker is editing `github-ci-status` in
`plugins/github/commands.ts`, so the new commands live in a new file
`plugins/github/review.ts` and `commands.ts` is untouched.
