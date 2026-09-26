---
change: call-registered-fledge-plugins-as-tools-issue-112-fledge-4-5-plugin-2-3-6-discover-the-project-s-fledge-plugins-via-the
artifact: docs
---

# Docs

- `corvidinho plugins list` help text already names PLUGIN-6; its output now
  carries the cost summary and Fledge status line (self-describing).
- Living spec `specs/plugins/plugins.spec.md` lists the new files; requirements
  land via deltas. No CHANGELOG / STATUS / version edits in this PR (release
  PRs own those).
- PR body records the SAFE-1 justification for `dangerous: true` on every
  Fledge command and the items left for HI capture.
