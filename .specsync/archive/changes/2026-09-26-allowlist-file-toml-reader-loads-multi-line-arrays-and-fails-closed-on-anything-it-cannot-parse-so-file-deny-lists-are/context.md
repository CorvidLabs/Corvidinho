---
change: allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are
artifact: context
---

# Context

Found in review of PR #191. The allowlist loader's TOML reader
(`parseSimpleToml` in `src/allowlist/load.ts`) worked one line at a time. For
`key = [` with nothing else on the line it stored an empty list, and then
skipped the continuation lines because they are not `key = value`. So an
operator file like

```toml
[github]
orgs = ["corvidlabs"]
deny_repos = [
  "corvidlabs/secret",
]
```

loaded with `deny_repos = []`, and `corvidlabs/secret` was admitted. That is a
fail-open for deny lists (GITHUB-6, ALLOW-1/2/5; ALLOW-3 / DISCORD-5 for
`deny_channels` / `deny_users`). The loader feeds WATCH, the daemon, the
Discord bridge config, `resolveActingIsAdmin`, `discord-post-message`,
`git-push` and, once #191 lands, the GitHub plugin gate.

Repro on main (`e8bbd21`): loading the file above gave `denyRepos: []` and
`isRepoAllowed("corvidlabs/secret")` returned `{ ok: true }`. `git-push` with
`CORVIDINHO_GITHUB_ALLOW_ORGS=acme` and a multi-line file
`deny_repos = [ "acme/widget", ]` pushed the branch.

A second gap: when the file existed but failed to load (bad JSON, unreadable),
`loadAllowlist` dropped the whole file and still merged the env overlays. Any
env allow then admitted what the file denied.
