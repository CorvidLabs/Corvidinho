---
change: github-ci-status-for-a-pr-or-ref-with-an-overall-ci-verdict-incl-legacy-commit-statuses-github-4-issue-94-captured
artifact: docs
---

# Docs

- `github-ci-status` description (shown by `plugins list` and the agent tool
  catalog) now reads PR-number-or-ref with argv examples and names the
  verdict values.
- Usage: `github-ci-status <pr-number|ref> --repo OWNER/REPO`. Digits-only
  branches or tags: `heads/<name>` / `tags/<name>`.
- `--json` output: `data.verdict`, `data.counts`, `data.sha`, `data.ref`,
  `data.pr`, `data.truncated`, `data.warnings`, and the per-check rows under
  `data.checks` (was the bare `data` array). Human output is one line, e.g.
  `CI red for PR #12 (feat/x) @ abc1234: 3 checks (pass 2, fail 1, pending 0, skipping 0); failing: lint`.
- `specs/plugins/plugins.spec.md`: files list, version, Change Log row;
  REQ-plugins-094 materialized into `specs/plugins/requirements.md`.
- No CHANGELOG / package version bump in this slice (coordinator ships).
