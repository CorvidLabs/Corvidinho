---
change: plugin-file-and-search-tools-with-protected-paths-plugin-1-2-safe-2-issue-81
artifact: testing
---

# Testing

## Local gates

- `bun test` (incl. `tests/files.plugins.test.ts`, `tests/search.plugins.test.ts`, version/update-helpers)
- `bunx tsc --noEmit` / `fledge lanes run verify --non-interactive`
- `specsync check`

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-plugins-081 | plugins list + minTier/dangerous markings in files.plugins / search.plugins / list smoke |
| REQ-plugins-082 | path escape / symlink fixture refuses in files.plugins.test.ts |
| REQ-plugins-083 | write/edit/delete against .env, fledge.toml, specs, keystore refuse; file unchanged |
| REQ-plugins-084 | builtins load; happy read/write/edit/glob/grep; STATUS/CHANGELOG |
| REQ-cli-013 | package.json 0.0.6; version.test.ts; CHANGELOG 0.0.6 section; STATUS #81 done |
