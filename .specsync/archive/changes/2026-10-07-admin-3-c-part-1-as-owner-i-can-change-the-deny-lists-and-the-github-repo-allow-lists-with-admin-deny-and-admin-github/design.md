---
change: admin-3-c-part-1-as-owner-i-can-change-the-deny-lists-and-the-github-repo-allow-lists-with-admin-deny-and-admin-github
artifact: design
---

# Design

- One writer, one table (`ADMIN_LISTS`): each list's section, canonical key,
  the alias `githubFromObj` / `discordFromObj` read, the live field, the env
  var(s) and the entry kind. `adminListFileKey` picks the spelling the loader
  reads (canonical if present, else the alias if present, else canonical) for
  TOML (`parseSimpleToml`) and JSON (the loader's own last-case-variant-wins
  list collection). `setTomlList` / `setJsonList` generalize the `[discord]`
  writers (kept as wrappers).
- Guard: TOML compares every key of every section except the target (as
  before); JSON compares the canonical form of the whole document without the
  target key's case variants (a created, otherwise empty section counts as
  absent). Both also re-check every list the loader reads.
- Handler: one `applyListChange` for every list route (old `users` /
  `channels` included): pre-plan refusals (deny wins, lockouts) → plan →
  post-plan refusals (env-only, channel lockout) → `started` (fail closed) →
  commit → `ok`. Exactly-one parsing per route; channel options accept the
  autocomplete id or `<#id>`.
- Lockout rule (conservative): refuse denying the owner's / invoker's Discord
  id, a role in the invoker's current `roleIds` or the guild id
  (`@everyone`), a channel when every live channel would be denied, and any
  GitHub login / id of the owner (`[owner]` plus the owner's declared
  person). Removing the last GitHub org / repo is allowed (WATCH polls
  nothing, by design) with a warning.
- WATCH: `reloadWatchAllowlist` assigns the new `sourcePath` / `github` /
  `discord` onto the same `allowlist` object and re-expands `repos` in place;
  the poller replaces its in-memory denied-id store on a GitHub-list change.
  Startup checks are unchanged. The event gate (`gateEvent`,
  `src/watch/router.ts`) also refuses a sender whose numeric id from the API
  event is on `deny_users`, so an id `/admin deny add github_user:` stores
  denies on WATCH as it does in the tool layer.
- Deny wins on an allow add: an org is refused when it is on `deny_orgs` or
  its `OWNER/*` is on `deny_repos`; a repo when its owner is on `deny_orgs`
  or `deny_repos` names it or its `OWNER/*`.
- No new env var, config key, table, schema or protocol version.
