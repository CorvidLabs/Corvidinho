---
change: cover-github-7-incidental-paths-loop-guards-state-changing-tools-plugins-list-smoke-for-github-pr-merge
artifact: context
---

# Context

PR #395 (GITHUB-7 typed `github-pr-merge`) also touched two paths that the
primary SpecSync change did not list in `affected_paths`:

- `src/agent/loop-guards.ts` — add `github-pr-merge` to
  `STATE_CHANGING_TOOLS` so REQ-agent-086's "every dangerous builtin in
  exactly one set" test stays green.
- `tests/plugins.list.smoke.test.ts` — expect `github-pr-merge` in
  `plugins list`.

`specsync change audit` on CI failed: those meaningful paths were not
covered by an active change. This cover change records them with
`--no-spec-change` (living agent/plugin specs already describe the
classification and list behavior; no new AC).
