---
change: admin-3-c-part-1-as-owner-i-can-change-the-deny-lists-and-the-github-repo-allow-lists-with-admin-deny-and-admin-github
artifact: docs
---

# Docs

- `docs/discord.md`: slash table rows for `/admin deny add|remove` and
  `/admin github add|remove`, the runtime-admin knob table (deny lists and
  `[github].orgs|repos` now updatable; mutes noted as part 2; `[github].users`
  and `[discord].roles` read-only), the writer's alias / guard rules, the
  exactly-one / validation and lockout bullets, the audit action names.
- `docs/WATCH.md`: allowlist changes apply without a restart (per-poll
  re-read, skip on load failure, nothing when empty, denied ids forgotten);
  a running watch skips polls while the file is broken.
- `docs/DISCORD-GO-LIVE.md`: the deny / GitHub lists are owner-editable with
  `/admin`; a running watch skips polls while the file is broken.
- `README.md`: the same fail-closed note for a running watch.
- `allowlist.example.toml`: the `[github]` comment names `/admin github` and
  `/admin deny`.
