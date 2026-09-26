# Testing — plugins

See `tests/plugins.*.test.ts` and `tests/github.*.test.ts`. Prefer fixtures over live `gh`.
- memory-* plugin list + forget ACL fixtures (REQ-plugins-010).
- files-* / search-grep happy path + SAFE-2 deny + path escape (REQ-plugins-081..084).
- git-* plugins against temp repos (`git init` in mkdtemp, isolated git config)
  and a local bare remote at `<tmp>/acme/widget.git` gated via
  `CORVIDINHO_GITHUB_ALLOW_REPOS` / a temp allowlist file (REQ-plugins-182).
