---
change: allowlist-loader-expands-a-leading-in-corvidinho-allowlist-file-to-home-so-the-documented-env-example-no-longer
artifact: context
---

# Context

W12 bug sweep seed `allowlist-file-tilde-silently-ignored` (Leif interview
2026-09-28, Wave 0: no new criteria). ALLOW-4 (`hi/allow.md`): allowlists load
from config on the bot VM. GITHUB-6 (`hi/github.md`): repos it will not touch.
REQ-plugins-006 names `CORVIDINHO_ALLOWLIST_FILE` as the file path.

`.env.example` documents `# CORVIDINHO_ALLOWLIST_FILE=~/.config/corvidinho/allowlist.toml`.
Bun's `.env` loader keeps the `~` literally, and `resolveAllowlistPath`
returned an explicit value verbatim, so the loader looked for a cwd-relative
`~/.config/…`, found nothing and fell back to env overlays only, with no error.
The file's `deny_repos` / `deny_users` and `[owner]` were dropped while an env
allow list still admitted targets. Every reader shares the resolver: the
allowlist loader (bridge, WATCH, GitHub repo gate, Discord plugins), the owner
loader, the `/admin` write target (which would have created `./~/.config/…` in
the cwd) and doctor (`[info] … not found — env overlays only`).

Leif's design calls (interview record): expand a leading `~` or `~/` to the
process HOME only (no `~user`); keep explicit absolute paths as-is; make the
`.env.example` comment true for this code (a parallel docs PR may say `~` is
not expanded). Bug-fix kind; regression tests must fail on `main`.

Constraints: no new env var, config key, command or schema change; a missing
explicit file stays "env overlays only" (the test preload relies on it,
REQ-plugins-253). #232 / #233 scope untouched.
