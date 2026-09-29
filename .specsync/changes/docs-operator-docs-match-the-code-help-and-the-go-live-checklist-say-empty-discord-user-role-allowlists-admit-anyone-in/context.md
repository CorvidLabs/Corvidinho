---
change: docs-operator-docs-match-the-code-help-and-the-go-live-checklist-say-empty-discord-user-role-allowlists-admit-anyone-in
artifact: context
---

# Context

A docs + e2e audit of `origin/main` (246cb6c, re-checked on 310861f) found
three places where operator-facing text says something the code does not do
(verified findings `help-says-empty-user-role-deny-all`,
`env-example-tilde-allowlist-path`, `daemon-md-missing-start-failed-event`):

- `corvidinho --help` said the Discord channel / role / user allowlists are
  "empty = refuse (deny-all)", and the go-live checklist that `doctor` and
  `discord bridge` print said "empty = deny-all when those gates apply" for
  users/roles. The code (`resolvePermissionLevel`, REQ-discord-043) admits
  anyone in an allowlisted channel while users and roles are both empty; the
  first listed user or role narrows it to those users, role holders and the
  owner. `tests/docs.operator-facts.test.ts` already refused that wording in
  the markdown docs but never looked at the checklist or `--help`.
- `.env.example` suggested `CORVIDINHO_ALLOWLIST_FILE=~/.config/...`. Neither a
  systemd `EnvironmentFile` nor Bun's `.env` loader expands `~`, and
  `resolveAllowlistPath` uses the value as given, so the file was "not found"
  and its deny lists were silently dropped (REQ-plugins-006: a missing file
  means env overlays only).
- `docs/DAEMON.md`'s Logs table had no row for `daemon.start_failed` (start
  refused, exit 1, e.g. a malformed allowlist file) or `spend.warning`.

Decisions come from Leif's 2026-09-28 interview (wave 0: docs + e2e audit, no
new criteria). No hi/ ids are captured by this change. #232/#233 scope is not
touched.
