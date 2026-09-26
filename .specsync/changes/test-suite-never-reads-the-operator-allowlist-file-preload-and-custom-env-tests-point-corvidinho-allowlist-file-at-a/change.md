---
id: test-suite-never-reads-the-operator-allowlist-file-preload-and-custom-env-tests-point-corvidinho-allowlist-file-at-a
state: approved
type: bug_fix
base_commit: 8129f4d1f055ea6ee19bfd9a013797fe5b140c53
---

# Test suite never reads the operator allowlist file (preload and custom-env tests point CORVIDINHO_ALLOWLIST_FILE at a missing file) and a malformed allowlist file contributes nothing at the GitHub plugin gate (REQ-plugins-253)

## Intent

Test suite never reads the operator allowlist file (preload and custom-env tests point CORVIDINHO_ALLOWLIST_FILE at a missing file) and a malformed allowlist file contributes nothing at the GitHub plugin gate (REQ-plugins-253)

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- With an operator allowlist file admitting corvidlabs (via CORVIDINHO_ALLOWLIST_FILE or ~/.config/corvidinho/allowlist.toml) bun test has 0 failures and no test reaches api.github.com with a GitHub token set; at the GitHub plugin gate a malformed or unreadable allowlist file contributes nothing (its deny and allow entries are dropped) while env overlays still apply, and with no env allow the gate refuses

## No-spec Rationale

Not applicable
