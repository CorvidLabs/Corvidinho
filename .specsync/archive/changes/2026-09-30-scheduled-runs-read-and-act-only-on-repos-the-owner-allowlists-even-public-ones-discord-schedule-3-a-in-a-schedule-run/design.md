---
change: scheduled-runs-read-and-act-only-on-repos-the-owner-allowlists-even-public-ones-discord-schedule-3-a-in-a-schedule-run
artifact: design
---

# Design

- `src/plugins/roles.ts`: `SCHEDULE_SESSION_PREFIX = "schedule_"` and
  `isScheduleRunEnv(env)` (`CORVIDINHO_DISCORD_SESSION_ID` starts with it).
- `src/scheduler/service.ts`: `runOne` builds `sessionId` from the constant
  and passes `schedule: true` to `resolveProjectDir`. Start-up recovery does
  not pass it, so leftover worktrees of runs on a now-refused project are
  still parked.
- `src/plugins/githubPublic.ts` `checkRepoGateForActingRole`: after the deny
  lists, in a schedule env, `checkGithubRepo` must pass (error names
  DISCORD-SCHEDULE-3.a); no visibility lookup is made for a refused repo. The
  existing role branches then run unchanged.
- `plugins/web/fetch.ts`: `WebFetchDeps` gains `env` and `allowlist`
  seams; `githubRepoOfUrl(url)`; `scheduleRepoGate` reads the allowlist once
  per call (`tryLoadAllowlist`) in a schedule env; `run`'s `checkHop`
  (shape check + gate) is applied to the first URL and every redirect before
  DNS. `plugins/web/commands.ts` passes `deps.env ?? process.env` and adds a
  line to the tool description.
- `src/worktree/manager.ts`: `ResolveProjectOptions.schedule`;
  `nestedCheckoutError` (the dir's `--show-toplevel` inside the root and not
  the root ⇒ that checkout's origin must pass `isRepoAllowed`).
- `src/discord/command-handlers/schedule.ts`: `/schedule create` passes
  `schedule: true`.
- No env var, config key, command, table, column or schema version.

Design choices pending Leif:

1. **Role rules stay on top in a scheduled run.** The synthesis said
   "allowlist only, no visibility lookup". Here a repo off the allowlist is
   refused with no lookup (that part is as planned), but an allowlisted repo
   still goes through the role rules, so a community-stamped schedule run
   still needs a public repo for reads (ROLES-CHAT-8) and its writes stay
   refused (ROLES-CHAT-3). The schedule rule only ever narrows. Today every
   schedule is community-stamped, so an owner's schedule still cannot read an
   allowlisted private repo until DISCORD-SCHEDULE-1.a stamps owner schedules
   as owner. Alternative: allowlist only for every role in a scheduled run.
2. **Which GitHub hosts web-fetch gates.** `github.com`,
   `githubusercontent.com` and every subdomain of either. Only five
   host/path shapes name a repo; gists, release-asset and LFS objects,
   avatars, `docs.github.com`, profile / search / `/orgs` pages and API
   routes other than `/repos/` are refused in a scheduled run. GitHub Pages
   (`*.github.io`) and other mirrors are not gated. Alternative: gate only the
   named hosts, or let gists and release assets of allowlisted owners through.
3. **Nested checkouts.** Any directory in a checkout nested inside the bridge
   root counts (not only its top), and a nested checkout with no origin is
   refused. The bridge root's own checkout is unchanged even when its origin
   is off the allowlist, as are plain folders.
4. **Existing schedules** on such a checkout are not paused or migrated: they
   fail at their next tick through the REQ-discord-353 stuck ask (auto-pause
   after five), with an upgrade note in the docs.
5. **Refusal text.** GitHub tools append "scheduled runs use allowlisted
   repos only, even public ones (DISCORD-SCHEDULE-3.a)"; web-fetch names only
   the host, never the path (a redirect path is server-chosen).
