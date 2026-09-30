---
change: gif-search-through-giphy-plugin-8-plugin-9-issue-318-slice-b-a-dangerous-mintier-1-gif-search-command-in-a-new-plugins
artifact: testing
---

# Testing

New `tests/gif.search.test.ts` (30 tests; no network: a fake resolver, a fake
transport answering like GIPHY's Tenor-compatible search, the fake key
`test-key-not-real`, in-memory ledger DBs):

- Registration and gating: dangerous / minTier 1 / no must-ask entry /
  `NO_STATE_CHANGE_TOOLS`; catalog only when allowlisted, never at read tier;
  owner, null and team offered, community never, team still without
  `web-fetch` and `discord-send-file`; `TEAM_SEARCH_TOOLS` is `web-search`
  and `gif-search`; SAFE-1 deny with a `denied` row and SAFE-5 `started` /
  outcome rows; a community role session refused, a team one reaches the
  handler.
- Request: exactly one GET (no download) to the pinned address of
  `api.giphy.com` `/v2/search` with exactly `q`, `key`,
  `client_key=corvidinho`, `limit`, `media_filter=gif,tinygif`,
  `contentfilter=medium`, and only the fixed API headers; query text never
  overrides the filter (`cats&contentfilter=off&rating=r` and variants stay
  `q`); `--contentfilter`, `--rating`, `--media-filter`, `--download`,
  bad limits, words with `--query`, missing / 51-character queries are usage
  errors that send nothing; no / blank / spaced / short key →
  `not-configured`; secret-carrying queries refused before anything is sent.
- Output: fenced titles and GIPHY media links in GIPHY's order, nothing of a
  result outside the fence, `postAs: "link"`, the link-only guidance and
  "Powered By GIPHY"; media-host validation (drops only); `(no results)`;
  `api-error` / `bad-response`.
- SAFE-13 through `createTaskExecute`: a hostile GIF title drops
  `gif-search`, `web-search`, `web-fetch` and `files-write` for the rest of
  the run and refuses the later `files-write`; an ordinary result trips
  nothing.
- SAFE-6: the key and the request URL never come back (GIPHY, transport,
  redirect and DNS echoes; split keys; through `runPlugin` and the audit
  rows); env drop lists and `formatErrorLine`.
- Transport: non-public answer and redirect refused (exit 2); GIPHY error
  mapping; abort, timeout, stopped run; unexpected failure line.
- SAFE-8: no cap, no DB; a $0 `reserved` row before the request settling
  `actual` / `failed` / `estimated` at 0; a stopped run writes no row; past
  the cap or with an unavailable ledger nothing is sent and the ask rides
  `spendAsk`; the tool loop ends the attempt with `SPEND_CAP_SUMMARY`.
- Docs: `.env.example` and `docs/DISCORD-GO-LIVE.md` carry the key, the
  table row, `contentfilter=medium` and "Powered By GIPHY".

Updated: `tests/roles.team.test.ts` and `tests/web.search.test.ts`
(`TEAM_SEARCH_TOOLS` = `gif-search`, `web-search`; team catalog offers
`gif-search`), `tests/preload.operator-data-dir.test.ts` +
`tests/fixtures/preload-probe.ts` (a child `bun test` never sees
`GIPHY_API_KEY`). `tests/fledge.plugins.test.ts` is unchanged: every
builtin plus a small fake Fledge plugin is 8076 tokens with `gif-search`
(7973 on the base), under the new 8500 default budget.

## Fail on the base (PR A's head d768396, a detached worktree)

1. The new and updated test files copied onto the base sources: 61 pass, 5
   fail, 1 error. `tests/gif.search.test.ts` cannot load (`Cannot find
   module '../plugins/gif/index.ts'`); the preload test fails (the child
   sees `GIPHY_API_KEY`); the web-search PLUGIN-9 test and both
   `tests/roles.team.test.ts` role tests fail on `TEAM_SEARCH_TOOLS`.
2. The same plus the new `plugins/gif` module, every other source at the
   base (no builtin load, no team rule, no scan entry, no drop / scrub
   lists): `tests/gif.search.test.ts` 19 pass, 11 fail — registration,
   catalog, PLUGIN-9 catalog, SAFE-1 / SAFE-5 rows, the role session, the
   SAFE-6 query check (the key is not a secret env name there), SAFE-13, the
   echo and split-key tests (the key comes back unredacted), the env drop
   lists, and the docs.
3. `src/plugins/builtins.ts` loading `gif-search` with the base
   `TOOL_SURFACE_BUDGET_TOKENS` (8000): `tests/fledge.plugins.test.ts`
   "per-command cost …" fails (`overBudget` true); with 8500 it passes.

## Gates (macOS, Darwin 25.5.0, bun 1.4.0)

- `bunx tsc --noEmit`: clean. `hi check`: clean. `specsync check
  --require-coverage 100`: 5 specs passed, 209/209 files (100%).
- `bun test`: 3054 pass, 1 skip, 96 fail, 7 errors (3151 tests, 210 files).
  95 of the 96 failures are the same tests that fail on an untouched main
  507d97b worktree (2991 pass, 95 fail, 7 errors): Linux-only process-tree,
  `/proc`, fledge-binary and fake-box tests (list below). The 96th, `schedule
  tick uses project worktree … > tick spawns with cwd under schedule project
  worktree then parks` (`tests/discord.session-worktree.test.ts`), is a
  timing flake that also fails on untouched main (5 of 12 runs) and on PR A's
  head (4 of 12).
- `fledge lanes run verify --non-interactive`: lint and smoke pass; the
  `test` step fails on macOS (3055 pass, 95 fail, 7 errors), and its 95
  failures are exactly main 507d97b's set (the flaky schedule-tick test
  passed in that run), so the lane stops before `spec-check`, which passes
  on its own. Linux CI / the VPS is the real verify.
- `specsync change check`: blocked by design until PR A's change is
  accepted (`dependency … is draft; it must be accepted before … can
  start`).

### macOS-only failures (the same set on this branch and on main 507d97b)

- abort after the agent exited kills what it left holding the output pipe
- bridge stop and start (REQ-discord-346) > start fails a run a killed process left running and removes its worktree; a live process's run is untouched
- bridge stop and start (REQ-discord-346) > start never touches a schedule-run worktree whose run another data dir owns
- bridge stop and start (REQ-discord-346) > stop records the in-flight schedule run failed, kills its agent and removes its worktree
- bridge writes attachments inside the session workspace (DISCORD-9 / REQ-discord-013) > agent files-read opens the image under the session cwd as an image part; git ignores it; session end deletes it
- CLI error boundary (REQ-cli-419) > a throwing plugin handler (unusable data dir) is one line + hint
- CLI error boundary (REQ-cli-419) > a throwing plugin handler with --json prints {ok:false,error}
- CLI error boundary (REQ-cli-419) > discord bridge with an unusable data dir: one line + hint, exit 1
- corvidinho --project <path> (CLI-5, REQ-cli-505) > children the CLI spawns get the project's env, not the start dir's .env values
- corvidinho --project <path> (CLI-5, REQ-cli-505) > loads the project's .env files exactly as starting there would, not the start dir's
- corvidinho backup list|restore and doctor (OPS-1/2) > restore refuses the live DB while a process holds it, even with --force
- corvidinho plugins run fledge-* (FLEDGE-4 / SAFE-1) > allowlisted run goes through fledge plugins run in the project root
- corvidinho-update.sh ready gate (fake box) > REQ-cli-347: pidfile mode: a bridge that never logs in rolls back after CORVIDINHO_READY_TIMEOUT
- corvidinho-update.sh ready gate (fake box) > REQ-cli-347: pidfile mode: a bridge that prints protocol OK then exits 1 on login rolls back
- corvidinho-update.sh ready gate (fake box) > REQ-cli-347: pidfile mode: a bridge that prints the login line passes
- corvidinho-update.sh ready gate (fake box) > REQ-cli-347: systemd mode keeps its systemctl is-active check
- corvidinho-update.sh restart mode + env (fake box) > REQ-cli-347: CORVIDINHO_BRIDGE_CMD with pkill -f cannot kill its own shell
- corvidinho-update.sh restart mode + env (fake box) > REQ-cli-347: env file is loaded before doctor and the unit restart
- corvidinho-update.sh restart mode + env (fake box) > REQ-cli-347: explicit CORVIDINHO_BRIDGE_UNIT wins over a leftover stale pidfile
- corvidinho-update.sh restart mode + env (fake box) > REQ-cli-347: leftover pidfile without a unit keeps pidfile mode
- corvidinho-update.sh restart mode + env (fake box) > REQ-cli-347: rollback after a failed bun install restarts with the env file
- corvidinho-update.sh restart mode + env (fake box) > REQ-cli-347: rollback restart sees the env file
- corvidinho-update.sh restart mode + env (fake box) > REQ-cli-347: unit mode never signals a live pid named by a leftover pidfile
- council plugin (REQ-plugins-118) > the council time cap stops slow voices
- daemon lock > a recycled pid (different /proc start time) is stale
- daemon start recovers what a dead process left (REQ-cli-108) > a schedule-run worktree another data dir owns is never touched, even when started inside it
- daemon stop parks an abandoned run's worktree (REQ-cli-108) > an abandoned run's branch with commits is kept, never force-deleted
- daemon stop parks an abandoned run's worktree (REQ-cli-108) > stop after the grace removes the abandoned run's worktree and empty branch
- delegate plugin handler (fake bin) > lead abort stops the worker (AGENT-3)
- delegate plugin handler (fake bin) > lead abort stops the worker's whole tree (AGENT-3, REQ-agent-117)
- delegate plugin handler (fake bin) > timeout stops the worker
- delegate plugin handler (fake bin) > timeout stops the worker's whole tree, not just the worker (REQ-agent-117)
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > a PNG goes to the conversation's channel as image/png, bytes unchanged, parsing no mentions
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > a server limit lower than 8 MB (Discord 413 / code 40005) is reported, not retried
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > DISCORD-5 / REQ-discord-212: a thread allowlisted by its own id attaches without its parent listed, as the router serves it; a deny on the thread or its parent still wins
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > DISCORD-5 / REQ-plugins-005: a deny-listed thread is refused even under its allowlisted parent (deny wins); nothing checked or uploaded
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > DISCORD-5: the channel allowlist gates first; a thread passes through its allowlisted parent
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > DISCORD-8: an acting user who cannot attach, or a check that cannot run, sends nothing
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > dry run posts nothing
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > only allowed types; an image whose bytes do not match its name, or non-UTF-8 text, is refused
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > over Discord's 8 MB upload limit is refused before any upload
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > REQ-discord-004: a channel the bridge listens in only through DISCORD_CHANNEL_IDS attaches; a deny still wins
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > SAFE-2: a file swapped after the path checks (for a link to .env, or its folder for a link into .ssh) is refused; what is read is what was checked
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > SAFE-5: every attach is on the audit trail like other posts
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > SAFE-6: a text log is secret-scrubbed before upload, the bot token's own value too
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > the 8 MB cap holds for the bytes read: a file that grew past it after its size was checked is refused, reading no more than the cap + 1 byte
- discord-send-file plugin (REQ-discord-476, DISCORD-17) > the caption parses no mentions and is defanged and scrubbed
- files plugins (REQ-plugins-081..083) > SAFE-2: a project under a keystore-named directory stays writable outside its own keystores
- files plugins (REQ-plugins-081..083) > SAFE-2.a: write/edit/delete refuse every path under .fledge/; reads stay allowed (REQ-plugins-083)
- fledge commands registered as dangerous plugins (PLUGIN-2 / SAFE-1) > allowlisted run: argv array (no shell), project cwd, scrubbed env
- fledge discovery (FLEDGE-4 / PLUGIN-3) > non-zero exit, bad JSON and timeout degrade with a reason
- fledge-lanes-run / fledge-run (dangerous, code tier) > timeout returns 124 and an aborted calling run returns 130
- git-diff secret paths (ROLES-CHAT-8) > non-admin git-diff of an explicit secret path is refused like files-read
- nightly ticker (OPS-1/2) > a run a dead process left unfinished is recorded as a failure and told once; a live one is left alone
- plugin argv keeps '--' tokens (REQ-plugins-243) > search-grep treats a '--' pattern as the pattern, not a dropped flag
- project files: doctor and a report-only init name what is missing (CLI-4) > a fledge.toml that is not TOML fails fledge.toml and verify-lane without printing its text; a .specsync file is not a directory
- project files: doctor and a report-only init name what is missing (CLI-4) > doctor in a complete project prints [ok] for each project item and passes
- project files: doctor and a report-only init name what is missing (CLI-4) > doctor in a dir without project files names each missing one and exits 1
- project files: doctor and a report-only init name what is missing (CLI-4) > from a subdirectory of a git project, init points at the project root that has the files instead of creating new ones
- project files: doctor and a report-only init name what is missing (CLI-4) > init in a complete project with a model and its key exits 0 and says nothing is missing
- project files: doctor and a report-only init name what is missing (CLI-4) > init is report only: in an empty dir it names the missing model provider, Fledge, SpecSync and each missing project file, creates nothing, exits 1
- restore (OPS-2) > never overwrites a DB a process holds open, even with --force
- runFledgeCommand failure modes > timeout kills the run and reports exit 124
- SAFE-1 / tier gates apply to the runners (REQ-plugins-313) > a run past the timeout is killed (exit 124)
- SAFE-1 / tier gates apply to the runners (REQ-plugins-313) > the calling run's abort stops the runner's process tree (exit 130)
- schema v10 schedule_runs.runner (REQ-discord-346) > a claimed run records its runner; a v9 DB migrates and its old running row counts as gone
- search plugins (REQ-plugins-081) > search-grep finds matches under cwd
- search-grep match records > a file name holding ':N:' keeps its file, line and text
- search-grep secret paths (ROLES-CHAT-8) > ADMIN and local CLI still grep secrets, matching files-read
- search-grep secret paths (ROLES-CHAT-8) > non-admin explicit secret path is refused like files-read
- search-grep secret paths (ROLES-CHAT-8) > non-admin recursive search leaves every secret file out
- shell-exec SAFE-3 clamp checks the scripts a command runs (REQ-plugins-087) > unit: a shell reading commands from its input checks that input
- shell-exec SAFE-3 clamp checks the scripts a command runs (REQ-plugins-087) > unit: a sourced, shell-run or executed script that escapes refuses
- shell-exec SAFE-3 clamp checks the scripts a command runs (REQ-plugins-087) > unit: in-root scripts, programs and non-shell files stay allowed
- shell-exec SAFE-3 clamp checks the scripts a command runs (REQ-plugins-087) > unit: scripts the clamp cannot read or trust refuse
- shell-exec SAFE-3 clamp checks the scripts a command runs (REQ-plugins-087) > unit: trap actions and alias definitions are checked
- shell-exec SAFE-3 scripts end to end (REQ-plugins-087) > a script that would escape returns exit 2 with SAFE-3 and never spawns
- shell-exec SAFE-3 scripts end to end (REQ-plugins-087) > in-root scripts still run
- shell-exec spawn is bounded and scrubbed (REQ-plugins-495) > the calling run's abort kills a long command (exit 130)
- slash + schedule refuse an out-of-scope project (REQ-discord-202) > /work on an allowlisted sibling still runs in its own worktree
- startDaemon > stop after the grace kills an abandoned run's process tree (AGENT-3)
- stopping real process trees > killProcessTree stops the child, its group and a setsid grandchild
- stopping real process trees > SIGTERM snapshot lets a later kill reach grandchildren orphaned meanwhile
- task run interrupted by a signal (AGENT-3, REQ-cli-244) > a lane process that escaped the tree kill and holds the output pipe does not keep the run from exiting
- task run interrupted by a signal (AGENT-3, REQ-cli-244) > SIGINT during verify: cancelled result frame, exit 130, verify lane stopped
- task run interrupted by a signal (AGENT-3, REQ-cli-244) > SIGINT the run started with ignored (a background job) stays ignored; SIGTERM still cancels
- task run interrupted by a signal (AGENT-3, REQ-cli-244) > SIGTERM during verify: cancelled result frame, exit 130, verify lane stopped
- timeout / abort stop the plugin's whole tree (REQ-plugins-113 / 154) > the calling run's abort stops the tree (exit 130, aborted)
- timeout / abort stop the plugin's whole tree (REQ-plugins-113 / 154) > timeout kills the plugin, a same-group and a setsid grandchild
- tracked children die with their parent > a `once` shutdown handler registered first (bridge) is not cut short
- tracked children die with their parent > a parent started with SIGHUP ignored (nohup) survives SIGHUP while tracking
- tracked children die with their parent > a parent started with SIGHUP ignored still ignores it after untracking
- tracked children die with their parent > a parent that handles SIGTERM itself keeps its grace; exit still kills
- tracked children die with their parent > parent exit kills what an exited child left in its group (exit snapshot)
- worktree manager (SESSION-WORKTREE-1/3/5) > default branch 'trunk': branch with commits survives cleanup, clean branch is deleted

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-3182` | `tests/gif.search.test.ts` | Registration, gating, request shape and fixed filter, usage / not-configured / SAFE-6, fenced output and host validation, SAFE-13, key and URL never returned, transport refusals and error mapping, abort / timeout, $0 spend, docs. New module (cannot load on the base); behaviour failures with the module present shown in step 2 above. |
| `REQ-plugins-065` | `tests/roles.team.test.ts`, `tests/gif.search.test.ts`, `tests/web.search.test.ts` | `TEAM_SEARCH_TOOLS` is `gif-search` and `web-search`; team catalog offers `gif-search`, community never; community role session refused at `runPlugin`, team reaches the handler. Fails on the base. |
| `REQ-plugins-113` | `tests/gif.search.test.ts` | `fledgeChildEnv` drops `GIPHY_API_KEY` and keeps `PATH`. Fails on the base. |
| `REQ-plugins-114` | `tests/fledge.plugins.test.ts` | Every builtin plus a fake Fledge plugin under the 8500 default budget; over the old 8000 with `gif-search` loaded (step 3). |
| `REQ-agent-002` | `tests/gif.search.test.ts`, `tests/agent.verify-env.test.ts` | `isVerifyEnvDropped` / `buildVerifyEnv` drop `GIPHY_API_KEY`. Fails on the base. |
| `REQ-agent-117` | `tests/gif.search.test.ts`, `tests/autonomous.delegate.test.ts` | `isWorkerEnvDropped` and `buildDelegateSpawn` drop `GIPHY_API_KEY`. Fails on the base. |
| `REQ-agent-071` | `tests/gif.search.test.ts`, `tests/safe.injection.test.ts` | `gif-search` in `INJECTION_SCAN_TOOLS`; a hostile title drops the web / GIF tools and `files-write`; an ordinary result trips nothing. Fails on the base. |
| `REQ-agent-086` | `tests/gif.search.test.ts`, `tests/agent.loop-guards.test.ts` | `gif-search` in `NO_STATE_CHANGE_TOOLS` only. Fails on the base. |
| `REQ-agent-098` | `tests/gif.search.test.ts` | $0 row reserved before the request and settled at 0; stopped past the cap / unavailable ledger; tool loop ends with the ask. |
| `REQ-discord-417` | `tests/gif.search.test.ts` | `redactSecretEnvValues` and `formatErrorLine` redact the `GIPHY_API_KEY` value (a GIPHY URL keeps `key=[redacted:env-secret]`). Fails on the base. |
| `REQ-cli-262` | `tests/preload.operator-data-dir.test.ts` | A child `bun test` started with `GIPHY_API_KEY` set sees none of the run settings. Fails on the base. |
