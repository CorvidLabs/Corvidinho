---
change: plugin-host-github-read-plugins-safe-1-deny-cli-plugins-surface
artifact: requirements
---

# Requirements (WATCH)

### REQ-plugins-001
Typed plugin registry register/list/get with danger/minTier (PLUGIN-1/2/6).

### REQ-plugins-002
Dangerous + non-interactive without allowlist denies (SAFE-1 / CLI-3).

### REQ-plugins-003
github-pr-list/status/ci-status/issue-list via typed gh JSON (GITHUB-1/4). Read-only.

### REQ-plugins-004
Repo deny/allow gate; explicit --repo required (GITHUB-6).

### REQ-cli-004
CLI plugins list/run; non-interactive env/flag; doctor plugin count.
