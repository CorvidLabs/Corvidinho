---
change: github-ci-status-for-a-pr-or-ref-with-an-overall-ci-verdict-incl-legacy-commit-statuses-github-4-issue-94-captured
artifact: research
---

# Research

- HI: `hi/github.md` GITHUB-4 (PR or ref green/red), GITHUB-1 (typed tools,
  not shell), GITHUB-6 (repo gate). Draft GITHUB-11 (issue #94) is not HI.
- GitHub REST: `GET /repos/{o}/{r}/commits/{ref}/check-runs`
  (`checks.listForRef`, `total_count` + `check_runs`, paged, latest run per
  name) and `GET /repos/{o}/{r}/commits/{ref}/status`
  (`repos.getCombinedStatusForRef`, latest status per context). `ref` accepts
  a SHA, a branch name, `heads/<branch>` or `tags/<tag>`; Octokit
  percent-encodes `/` in the path segment.
- Check-run conclusions: success, failure, neutral, cancelled, skipped,
  timed_out, action_required, plus `stale` seen in the wild. Status states:
  success, failure, error, pending. A combined status with zero contexts
  reports `state: pending`, so the verdict uses the per-context list, never
  the combined `state`.
- Ref syntax follows `git check-ref-format` (no `..`, `@{`, `//`, control or
  space, `~^:?*[\`, leading/trailing `/`, trailing `.`, `.lock` or leading-dot
  components); a leading `-` is refused as option-looking.
- Old row shape mirrors `gh pr checks --json name,state,bucket,link`
  (fixture `tests/fixtures/github/ci-status.json`); gh buckets skipped/neutral
  as `skipping`.
- corvid-agent `server/polling/auto-merge.ts` waits on checks the same way
  (red beats pending beats green); its retry loop belongs to draft GITHUB-11.
