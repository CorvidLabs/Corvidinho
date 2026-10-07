---
module: watch
change: admin-3-c-part-1-as-owner-i-can-change-the-deny-lists-and-the-github-repo-allow-lists-with-admin-deny-and-admin-github
---

# Delta: watch (github watch re-reads the allowlist every poll — ADMIN-3.c part 1)

## Added

### REQUIREMENT REQ-watch-043

As owner I can change deny lists, mutes and the GitHub repo allow lists with
/admin; every change is audited (ADMIN-3.c, captured in `hi/admin.md`; this
part covers the deny lists and the GitHub repo allow lists).

`github watch` SHALL re-read the allowlist (file and env, resolved exactly as
at start) at the start of every poll cycle, after the rate-limit backoff check,
like the schedule daemon's tick (`reloadWatchAllowlist`,
`src/watch/config.ts`), so an owner's `/admin deny` or `/admin github` change
on Discord, or a VM edit, applies on the next poll without a restart. The new
lists SHALL be spliced into the poller's config in place: `allowlist` keeps its
identity (routing, the people list and IDENTITY-12.a role resolution read it
per event) and `repos` is the same array, re-expanded from `[github].repos`
and `orgs`. When the file exists but cannot be loaded, the cycle SHALL be
skipped (`allowlistSkip: "unreadable"`, one error line `[watch] poll skip:
allowlist could not be loaded (…)`): nothing is fetched, nothing is spliced
and the last good lists stay (fail closed, never env-only). When the GitHub
repo/org allowlist is empty, the cycle SHALL poll nothing
(`allowlistSkip: "empty"`, `[watch] poll skip: GitHub repo allowlist empty …`).
When the GitHub lists differ from the cycle before, the in-memory denied ids
SHALL be forgotten (a fresh store), so events refused under the old lists are
gated again under the new ones, and one `[watch] allowlist changed: …` line
gives the list sizes (never entries). Start-up keeps refusing an empty repo
allowlist or an unloadable file. No new env var, config key, schema or
protocol change.

Acceptance Criteria
- After `/admin github add repo:` (plan + commit on the bridge's own allowlist), the next `pollOnce` polls the new repo and runs its event; the config's `repos` and `allowlist` objects are the same ones (`tests/watch.allowlist-reload.test.ts`).
- After `/admin deny add github_user:`, that user's next event is refused.
- A file that fails to load skips the cycle (`allowlistSkip: "unreadable"`, no fetch, no run, lists unchanged); once fixed the next cycle polls again with the file's deny lists.
- After `/admin github remove` of the last repo the cycle polls nothing (`allowlistSkip: "empty"`, `repos` empty); adding an org polls again.
- An event refused for a sender not on `[github].users` stays refused (quietly) while the lists are unchanged and runs after the file adds the sender.
- After a reload the owner's comment still runs as `owner` and a stranger's as `community` (IDENTITY-12.a).
