---
change: github-plugin-repo-gate-reads-the-allowlist-file-plus-env-overlays-so-file-deny-lists-apply-and-file-only-allow-lists
artifact: docs
---

# Docs

Canonical spec deltas add REQ-plugins-253 and REQ-discord-253 and list the new
test file in the plugins spec. No README/docs change: docs/WATCH.md and
allowlist.example.toml already describe file + env allowlists; the plugins
and the /work PR step now match them.
