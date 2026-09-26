---
change: github-plugin-repo-gate-reads-the-allowlist-file-plus-env-overlays-so-file-deny-lists-apply-and-file-only-allow-lists
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-253` | `tests/github.gate-allowlist-file.test.ts` | file-only `deny_repos` / `deny_orgs` with env-only `ALLOW_ORGS`: gate refuses `corvidlabs/secret` and `evilorg/x`, allows `corvidlabs/ok`; github-issue-create, github-issue-comment, github-pr-create and github-pr-review exit 3 for both targets, github-pr-diff exits 3; a community role session is still refused; a file-only allow list lets github-issue-create through (dry run) and refuses an unlisted repo; CLI `plugins run` with ~/.config/corvidinho/allowlist.toml exits 3 for the denied repo/org and 0 for the allowed one. 5 of 5 failed before the fix, 5 of 5 pass after. |
| `REQ-discord-253` | `tests/work.pr.test.ts` | default /work gate: file deny + env allow gives `repo-denied`, no plugin call, nothing pushed; file-only allow opens the draft PR (dry run). Failed before the fix, passes after. |
| `REQ-plugins-004` | `tests/github.deny.test.ts`, `tests/github.write.plugin.test.ts`, `tests/github.public.community.test.ts` | missing `--repo`, empty allow list, env deny and allow-match cases unchanged. |
| `REQ-discord-088` | `tests/work.pr.test.ts` | injected gate refusal, GITHUB-5, AGENT-4 and dry-run PR cases unchanged. |
