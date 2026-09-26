---
change: shell-exec-plugin-with-safe-3-project-root-cwd-clamp-plugin-1-2-safe-3-issue-83-package-0-0-9
artifact: testing
---

# Testing

| REQ | Evidence |
|-----|----------|
| REQ-plugins-086 | `tests/shell.plugins.test.ts` list markings + SAFE-1 deny; smoke `shell-exec` |
| REQ-plugins-087 | clamp unit cases + integration refuse `/tmp` and `cd ..`; allow `cd sub` |
| REQ-plugins-088 | builtins load; package 0.0.9; CHANGELOG/STATUS; hi-draft file |
| REQ-cli-015 | `bun src/cli.ts version` → 0.0.9 |

Commands: `bun test tests/shell.plugins.test.ts`, `bun test`, `fledge lanes run verify --non-interactive`.
