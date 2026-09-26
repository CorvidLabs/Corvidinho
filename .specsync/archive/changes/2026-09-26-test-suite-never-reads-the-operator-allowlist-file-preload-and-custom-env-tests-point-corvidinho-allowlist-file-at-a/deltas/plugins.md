---
module: plugins
change: test-suite-never-reads-the-operator-allowlist-file-preload-and-custom-env-tests-point-corvidinho-allowlist-file-at-a
---

# Delta — plugins (malformed allowlist file adds nothing; tests never read the operator file)

## Modified

### REQUIREMENT REQ-plugins-253

The GITHUB-6 repo gate used by every GitHub plugin (plugins/github commands
and review reads) SHALL build its allowlist with the ALLOW-4 loader
(`loadAllowlist`: the allowlist file — `CORVIDINHO_ALLOWLIST_FILE` or
~/.config/corvidinho/allowlist.toml|json — plus env overlays), the same
loader WATCH ingress uses, and SHALL NOT fall back to env overlays alone.
`deny_repos` / `deny_orgs` from the file SHALL win over an allow list from env
(and over the community public-repo path), and an allow list only in the file
SHALL admit matching repos. A missing, unreadable or malformed allowlist file
SHALL contribute nothing (none of its allow or deny entries apply) while env
overlays still apply, so with no env allow list the gate refuses
(default-deny). `checkRepoGateAsync` SHALL expose the same file + env gate to
other callers. The test suite SHALL NOT read the operator's allowlist file:
the bun test preload points `CORVIDINHO_ALLOWLIST_FILE` at a missing file,
and tests that hand a custom env object to a loader pass a missing file too.
No new env var, config key, slash command or plugin.

Acceptance Criteria
- With deny lists only in the file and the allow list only in env, github-issue-create, github-issue-comment, github-pr-create, github-pr-review and the review reads refuse the denied repo or org with exit 3 and a GITHUB-6 error; nothing is posted.
- With the allow list only in the file, allowed repos pass and unlisted repos are still refused.
- A non-admin role session is refused for a file-denied repo even when it is public.
- `corvidinho plugins run` with ~/.config/corvidinho/allowlist.toml honors its deny lists.
- With a malformed (truncated JSON) or unreadable (a directory) allowlist file and no env allow list, the gate and github-issue-create refuse with exit 3 (allowlist empty); with env `CORVIDINHO_GITHUB_ALLOW_ORGS` the env allow list applies and none of the file's entries do.
- With an operator allowlist file admitting corvidlabs (via `CORVIDINHO_ALLOWLIST_FILE` or ~/.config/corvidinho/allowlist.toml), `bun test` has no failures and no test sends a request to api.github.com while a GitHub token is set.
