---
change: test-suite-never-reads-the-operator-allowlist-file-preload-and-custom-env-tests-point-corvidinho-allowlist-file-at-a
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-253` | `tests/github.gate-allowlist-file.test.ts` | new "malformed or unreadable allowlist file contributes nothing; env overlays still apply": truncated `allowlist.json` and a directory path, no env allow ⇒ `checkRepoGateForActingRole` / `checkRepoGateAsync` refuse ("allowlist empty") and github-issue-create exits 3; with `CORVIDINHO_GITHUB_ALLOW_ORGS=corvidlabs` the repo passes (dry run), the file's `deny_repos` entry does not apply, and `other/repo` is still refused. Existing file deny/allow, community and CLI cases unchanged and passing. |
| `REQ-plugins-253` | `tests/preload.ts`, `tests/github.review.plugin.test.ts`, `tests/github.write.plugin.test.ts`, `tests/github.deny.cli.test.ts` | operator file `[github] orgs = ["corvidlabs"]`, full suite: before 2 failures via `CORVIDINHO_ALLOWLIST_FILE` and 3 via temp HOME/.config/corvidinho/allowlist.toml; after 0 failures both ways (1124 pass). With a dummy `GITHUB_TOKEN` and a local refuse-all logging proxy as HTTPS_PROXY: before 2 CONNECT api.github.com, after 0. |
| `REQ-plugins-253` | `tests/discord.bridge.cli.test.ts`, `tests/discord.thinking-bridge.test.ts`, `tests/discord.image-attachments.test.ts`, `tests/discord.session-worktree.test.ts`, `tests/discord.work-store.recovery.test.ts` | custom-env `startBridge` calls pass a missing `CORVIDINHO_ALLOWLIST_FILE`; all pass with and without an operator home file. |
| `REQ-plugins-004` | `tests/github.deny.cli.test.ts`, `tests/github.deny.test.ts` | missing `--repo`, empty allow list and env deny still exit 3; allowlisted repo passes the gate and stops at the missing-token exit 1 without calling GitHub. |
