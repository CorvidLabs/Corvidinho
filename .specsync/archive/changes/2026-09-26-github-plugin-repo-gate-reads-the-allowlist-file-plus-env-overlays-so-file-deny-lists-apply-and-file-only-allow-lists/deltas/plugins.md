---
module: plugins
change: github-plugin-repo-gate-reads-the-allowlist-file-plus-env-overlays-so-file-deny-lists-apply-and-file-only-allow-lists
---

# Delta — plugins (GitHub repo gate reads the allowlist file)

## Added

### REQUIREMENT REQ-plugins-253

The GITHUB-6 repo gate used by every GitHub plugin (plugins/github commands
and review reads) SHALL build its allowlist with the ALLOW-4 loader
(`loadAllowlist`: the allowlist file — `CORVIDINHO_ALLOWLIST_FILE` or
~/.config/corvidinho/allowlist.toml|json — plus env overlays), the same
loader WATCH ingress uses, and SHALL NOT fall back to env overlays alone.
`deny_repos` / `deny_orgs` from the file SHALL win over an allow list from env
(and over the community public-repo path), and an allow list only in the file
SHALL admit matching repos. An unreadable file SHALL add nothing (empty ⇒
deny). `checkRepoGateAsync` SHALL expose the same file + env gate to other
callers. No new env var, config key, slash command or plugin.

Acceptance Criteria
- With deny lists only in the file and the allow list only in env, github-issue-create, github-issue-comment, github-pr-create, github-pr-review and the review reads refuse the denied repo or org with exit 3 and a GITHUB-6 error; nothing is posted.
- With the allow list only in the file, allowed repos pass and unlisted repos are still refused.
- A non-admin role session is refused for a file-denied repo even when it is public.
- `corvidinho plugins run` with ~/.config/corvidinho/allowlist.toml honors its deny lists.
