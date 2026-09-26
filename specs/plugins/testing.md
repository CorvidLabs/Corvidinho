# Testing — plugins

See `tests/plugins.*.test.ts` and `tests/github.*.test.ts`. Prefer fixtures over live `gh`.
- memory-* plugin list + forget ACL fixtures (REQ-plugins-010).
- files-* / search-grep happy path + SAFE-2 deny + path escape (REQ-plugins-081..084).
