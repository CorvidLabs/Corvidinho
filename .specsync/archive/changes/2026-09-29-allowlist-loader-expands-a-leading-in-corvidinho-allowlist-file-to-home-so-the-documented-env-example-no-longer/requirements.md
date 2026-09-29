---
change: allowlist-loader-expands-a-leading-in-corvidinho-allowlist-file-to-home-so-the-documented-env-example-no-longer
artifact: requirements
---

# Requirements

- ALLOW-4 (`hi/allow.md`) and GITHUB-6 (`hi/github.md`), as REQ-plugins-006
  states them: the allowlist file named by `CORVIDINHO_ALLOWLIST_FILE` loads,
  and its deny lists win.
- Leif's 2026-09-28 design calls for this seed: a leading `~` or `~/` is the
  process HOME; no `~user`; explicit absolute paths unchanged; `.env.example`
  comment matches the code.
- Modify REQ-plugins-006 (delta `deltas/plugins.md`): a trimmed value that is
  `~` or starts with `~/` resolves against the HOME the loader uses for the
  default path; `~user` and every other value are used as written; the
  allowlist loader, owner loader, `/admin` write target and doctor all resolve
  the file this way.
- No new HI criteria, REQ id, env var, config key, command or package version.
