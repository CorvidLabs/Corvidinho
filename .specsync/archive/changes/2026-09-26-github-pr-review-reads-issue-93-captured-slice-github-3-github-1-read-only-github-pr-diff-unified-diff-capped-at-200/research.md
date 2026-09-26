---
change: github-pr-review-reads-issue-93-captured-slice-github-3-github-1-read-only-github-pr-diff-unified-diff-capped-at-200
artifact: research
---

# Research

- corvid-agent `server/mcp/tool-handlers/github.ts` (`handleGitHubGetPrDiff`) —
  diff read + size cap idea (issue #93 steal table).
- Corvidinho `plugins/github/commands.ts` — `requireRepo` → `checkRepoGate`
  (GITHUB-6 default-deny + deny wins), Octokit via `createOctokit`, argv style.
- Octokit: `pulls.get` with `mediaType: { format: "diff" }` returns the unified
  diff as text (`application/vnd.github.v3.diff`); GitHub answers **406** when
  the PR diff is too large for that endpoint. `pulls.listFiles` pages 100 per
  page and stops at **3000** files; its per-file `patch` is omitted for binary
  or very large files.
- `src/store/scrub.ts` `scrubSecrets` (SAFE-6) — patterns need a word boundary
  and a minimum length, so scrubbing must run on the full text *before* a cap.
  Review found its lazy PEM body and the JWT header segment quadratic on many
  openers with no closer (bun 1.4.2: 20,000 lines of
  `+-----BEGIN A PRIVATE KEY-----` 8.7 s; 200 KB of `eyJ-` 4.1 s), and
  regex runs synchronously, so a PR diff must be bounded before the scrub and
  the patterns made linear.
- Octokit accepts `request.fetch`, so tests can use a real client over a
  mocked fetch (no network, no token).
