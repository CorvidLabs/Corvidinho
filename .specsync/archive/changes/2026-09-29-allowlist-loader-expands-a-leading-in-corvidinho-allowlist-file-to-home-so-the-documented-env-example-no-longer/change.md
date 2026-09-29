---
id: allowlist-loader-expands-a-leading-in-corvidinho-allowlist-file-to-home-so-the-documented-env-example-no-longer
state: archived
type: bug_fix
base_commit: 0f2e2c2774635d1dcbdff599cba92dbecf8eebd9
---

# Allowlist loader expands a leading ~ in CORVIDINHO_ALLOWLIST_FILE to HOME so the documented .env example no longer silently drops the file's deny lists and owner

## Intent

Allowlist loader expands a leading ~ in CORVIDINHO_ALLOWLIST_FILE to HOME so the documented .env example no longer silently drops the file's deny lists and owner

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- CORVIDINHO_ALLOWLIST_FILE set to ~ or to a value starting with ~/ (after trim) resolves against the HOME the loader already uses, so the documented .env.example value ~/.config/corvidinho/allowlist.toml reads the same file as the default path: loadAllowlist / tryLoadAllowlist, the GITHUB-6 repo gate, the owner loader, the /admin write target and doctor all use that file, its deny lists win over an env allow list, and a malformed file behind ~ fails closed; ~user, absolute and relative values are used as written; a missing explicit file still contributes nothing (env overlays only); .env.example says how ~ is read; regression tests fail on main; no new env var, config key, command or schema change

## No-spec Rationale

Not applicable
