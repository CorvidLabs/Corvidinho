---
change: web-search-through-brave-plugin-7-plugin-9-issue-318-a-dangerous-mintier-1-web-search-command-in-plugins-web-offered
artifact: testing
---

# Testing

New `tests/web.search.test.ts` (no network: fake resolver, fake transport
answering like Brave, fake key `test-key-not-real`, in-memory ledger DBs):

- Registration and gating: dangerous / minTier 1; catalog only when
  allowlisted, never at read tier; owner, null and team offered, community
  never, team still without web-fetch; `TEAM_SEARCH_TOOLS` is `web-search`;
  SAFE-1 deny with a `denied` row and SAFE-5 `started` / outcome rows; a
  community role session refused, a team one reaches the handler.
- Request: host, path, `q` / `count` / `safesearch=moderate` / `freshness`,
  key header only, pinned address; usage errors (counts 0, 21, 5.5, abc, -3,
  1e1, missing; bad freshness; unknown flag; missing, blank, 401-char,
  51-word query; query words together with `--query`; a `--verbose` term
  outside `--query`) send nothing, and the usage line says a `--` term needs
  `--query`; no / blank / malformed key → not-configured, the error starting
  `web-search not-configured: web search is not configured`; secret-carrying
  queries (also the key split by a joiner) refused before anything is sent.
- Output: hostile hits only inside the fence (unique end marker, HTML /
  entity / control reduction, attribution in the summary), count cap,
  dropped non-http URLs, `(no results)`.
- SAFE-13 through `createTaskExecute`: an injected description notes the
  message and drops `web-search`, `web-fetch` and `files-write`; the write is
  refused; one notice; summary note.
- SAFE-6: the key echoed by results, error bodies, a non-JSON body, a
  transport error or a DNS error never comes back; the key split by a
  zero-width space, a soft hyphen, a bidi isolate, a tag character or BEL in
  a title, URL, description and age (json and text mode), in a resolver
  answer a SAFE-7 refusal names, or straight into `fenceSearchResults`, never
  comes back whole (the scrub is the last step); through `runPlugin` the
  result and audit rows carry neither the key, the path, the header name nor
  the pinned address; env drop lists and `formatErrorLine`.
- Keyed JSON GET: scheme / host / port / credentials refused before DNS;
  non-public answers refused before connecting; every redirect refused;
  content type, encoding, size, JSON validity, timeout, abort (the
  transport's own signal aborted on the deadline and on the caller's abort);
  a body that fails mid-read is `network`; 401 / 403 / 422 / 429 / 503
  mapping; the run's abort through the handler ends a pending search
  `aborted` and aborts the transport's signal, and a run already stopped
  sends nothing; an unexpected failure is one fixed line; web-fetch unchanged
  for any public host.
- SAFE-8: no cap opens no DB; reserve-before-request and settle (actual;
  failed on HTTP error / pre-connect refusal; estimated on network failure,
  timeout, non-JSON or malformed 2xx body and an abort after sending; no row
  for a run already stopped); at the cap, with an invalid cap and with an
  unavailable ledger (a closed DB: the ask says the spend ledger is
  unavailable) nothing is sent and the ask rides `spendAsk`; in the tool loop
  the attempt ends with `SPEND_CAP_SUMMARY` and the ask after one model call.
- The two `createTaskExecute` tests configure `CORVIDINHO_LLM_MODEL:
  "test-model"` (AGENT-13 on main: no built-in default model).
- SAFE-14 (after the rebase onto #328): with only
  `CORVIDINHO_PROVIDER_SPEND_CAPS_USD=llm.test=1` set (that provider already
  at its cap) a search is sent and settles `actual` at 5000; an entry keyed on
  `api.search.brave.com` makes the setting not valid: nothing sent, the ask
  names the setting, never its value.
- DISCORD-SCHEDULE-1.a (after the rebase onto #330): a schedule the owner
  created is offered `web-search`; a team member's schedule is not.
- The "Search by Brave" reply line (REQ-agent-318, Leif's go on #318): the
  map holds only `web-search`; two answered searches and a retry end the
  reply with the line once, and no model request contains it; an answer that
  already ends with it is not doubled; no line with no search, no key, a 429
  or a refused query; a team member's reply carries it; a run stopped at the
  spend cap after a search ends `SPEND_CAP_SUMMARY` plus the line, while the
  ask's question and `formatSpendStopDm` never carry it; `closingNotesTail`,
  `chatBodyFromTaskResult`, `resultFrame` and `planAnswerParts` keep it whole
  at the end (after the fallback note, before the role note).

Updated: `tests/web.fetch.test.ts` (web-search now exists),
`tests/roles.team.test.ts` (team search rule, team catalog),
`tests/preload.operator-data-dir.test.ts` and `tests/fixtures/preload-probe.ts`
(a child `bun test` never sees `BRAVE_SEARCH_API_KEY`).

## Fail on main

### After the rebase onto main 0aeb345 (then 81ceb4a)

- The pre-change `src/agent/execute.ts`, `src/agent/task-summary.ts` and
  `src/agent/spend.ts` (the rebased branch before this step) swapped in:
  `tests/web.search.test.ts` 36 pass, 6 fail — the SAFE-14 test and the five
  "Search by Brave" tests that need the line (the map, the answered search,
  the team reply, the spend-cap stop, the clips). The "no line" test and the
  owner-schedule test pass there too: they pin what must not appear, and
  main's #330 behaviour.
- Mutations, each caught: the line added for a failed call (`result.ok`
  dropped in the tool loop) fails the "no line" test; `closingNotesTail`
  not knowing the line fails the clip test; `reserveFlatSpend` back on
  `parseSpendCap` fails the SAFE-14 test.
- Branch test files on main 0aeb345's sources (`tests/web.search.test.ts`,
  `tests/web.fetch.test.ts`, `tests/roles.team.test.ts`,
  `tests/preload.operator-data-dir.test.ts` and
  `tests/fixtures/preload-probe.ts` copied into a main worktree): 257 pass, 5
  fail, 1 error. `tests/web.search.test.ts` cannot load (no
  `plugins/web/api.ts`); `web.fetch` fails "registered as a typed builtin";
  `roles.team` fails the catalog by role and `roleAllowsPlugin`;
  `preload.operator-data-dir` fails because the child sees
  `BRAVE_SEARCH_API_KEY`.

### Before the rebase (main 507d97b)

On a worktree of untouched main 507d97b, measured on macOS:

- **Branch test files on main's sources.** `tests/web.search.test.ts`,
  `tests/web.fetch.test.ts`, `tests/roles.team.test.ts`,
  `tests/preload.operator-data-dir.test.ts` and
  `tests/fixtures/preload-probe.ts` were copied in. Result: 254 pass, 5 fail,
  1 error.
  - `tests/web.search.test.ts` cannot load (`Cannot find module
    '../plugins/web/api.ts'`), so all 34 of its tests fail.
  - `web.fetch` fails "registered as a typed builtin", because main has no
    `web-search`.
  - `roles.team` fails `roleAllowsPlugin` and the catalog by role (no team
    search rule).
  - `preload.operator-data-dir` fails "bot run settings … do not reach the
    suite", because the child sees `BRAVE_SEARCH_API_KEY`.
- **Main's versions of the modified sources swapped into this branch.** The
  swapped files are `plugins/web/commands.ts`, `plugins/web/index.ts`,
  `plugins/fledge/spawn.ts`, `src/agent/execute.ts`,
  `src/agent/loop-guards.ts`, `src/agent/untrusted.ts`,
  `src/autonomous/delegate.ts`, `src/plugins/roles.ts`,
  `src/plugins/types.ts`, `src/store/scrub.ts` and `tests/preload.ts`. The
  new `api.ts` / `search.ts`, the export-only `fetch.ts` and
  `reserveFlatSpend` were kept. Result: 32 of 292 fail on behaviour: 28 of
  the 34 in `tests/web.search.test.ts` plus the 4 above. The 6 that pass
  call `apiGetJson` directly (5) or pin that `web-fetch` is unchanged (1).
- **The review-fix tests against the pre-fix implementation (457c2c1).**
  4 of 34 fail:
  - the usage test: query words with `--query` were silently dropped;
  - the split-key test: a key split by a zero-width space came back whole
    in the fenced content, and one split by BEL came back in a SAFE-7 error
    line;
  - the unexpected-failure test: the error carried the request path;
  - the settle test: a run already stopped still reserved.
  The other new tests pin behaviour that was already right: abort and
  deadline reach the transport's signal, 403 maps to `auth`, a body that
  fails mid-read is `network`, and an unavailable ledger fails closed. Each
  of those was checked by mutating the code:
  - the handler not forwarding `ctx.signal`;
  - a fresh signal passed to `dialPinned`;
  - 403 dropped from the auth map;
  - timeout, abort, `invalid-json` and `content-type` treated as not-billed;
  - `reserveFlatSpend`'s catch returning `off`;
  - the scrub moved back in front of the fence;
  - the error line scrubbed before it is normalised;
  - query words allowed with `--query`;
  - no early stop for a run already stopped.
  Every one of these mutations fails at least one test.
- With the branch restored, everything passes: `tests/web.search.test.ts`
  34/34, and the affected files together 447/447 (web.search, web.fetch,
  roles.team, preload.operator-data-dir, docs.operator-facts,
  agent.loop-guards, safe.injection).

## Results (macOS host; the repo is Linux-only)

On main 81ceb4a (the final base; #332 and #333 on top of 0aeb345):

- `bun test` on the branch: 3195 pass, 1 skip, 97 fail, 7 errors. Untouched
  main 81ceb4a on the same host: 3152 pass, 1 skip, 98 fail, 7 errors. Every
  branch failure is one of main's: the 95 names listed below plus #332's two
  macOS-only process-tree tests ("a stop kills the run's process tree; an
  Approve card it waited on closes as a no (AGENT-3, SAFE-20) > a run waiting
  on an Approve card is killed and the card closes as a no" and "… > the
  spawned agent and what it started are killed"). Main's 98th is the flaky
  schedule-worktree test described next, which passed on the branch this
  run.
- `tests/web.search.test.ts`: 42/42; `bunx tsc --noEmit`: clean.

On main 0aeb345, after the rebase and the "Search by Brave" line:

- `bun test` on the branch: 3167 pass, 1 skip, 96 fail, 7 errors. Untouched
  main 0aeb345 on the same host: 3126 pass, 1 skip, 95 fail, 7 errors. The
  95 main failures are the list below (the same 95 names as on 507d97b), and
  the branch fails exactly those plus one flaky test, "schedule tick uses
  project worktree … > tick spawns with cwd under schedule project worktree
  then parks" (`tests/discord.session-worktree.test.ts`: it sleeps 100 ms and
  then expects the worktree gone). That test flakes on untouched main too:
  run alone five times it failed 3 of 5 on main 0aeb345 and 3 of 5 on the
  branch; this change touches neither the scheduler nor worktrees.
- `bunx tsc --noEmit`: clean.
- `hi check`: 182 criteria, 20 families, 19 files, 5 retired.
- `specsync check --require-coverage 100 --no-cache`: 5 specs, 5 passed, 0
  failed; file coverage 208/208 and LOC coverage 100%.
- `tests/web.search.test.ts`: 42/42.
- Tool surface: builtins 8078 tokens (main 7951), under
  `TOOL_SURFACE_BUDGET_TOKENS` 9000 (#329); no schema changed in this step.

Before the rebase, on main 507d97b:

- `bun test` on the branch: 3025 pass, 1 skip, 95 fail, 7 errors. Untouched
  main 507d97b on the same host: 2991 pass, 1 skip, 95 fail, 7 errors. The
  two failure sets are identical (`comm` of the sorted `(fail)` lines shows
  nothing unique to either side). None are in the web-search, web-fetch,
  role, spend, preload or injection tests. They are process-group, signal,
  `/proc`, GNU-tool and `/private` path cases, so a Linux run (CI or the VPS)
  is still needed for a green suite.
- `hi check`: 181 criteria, 20 families, 19 files, 5 retired.
- `specsync check --require-coverage 100`: 5 specs, 5 passed, 0 failed; file
  coverage 206/206 and LOC coverage 100%.
- `specsync change audit` fails while the definition is unapproved: it says
  "meaningful changed paths are not covered by an active change", because a
  draft covers nothing. In a throwaway worktree (never pushed), approving it
  and running `specsync change check` gave `verified` for all 12 REQs and a
  passing audit, and `specsync check --require-coverage 100` still passed.

### macOS-only failures (the same set on the branch and on main 0aeb345, and on main 507d97b before the rebase)

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
| `REQ-plugins-318` | `tests/web.search.test.ts` | Registration (dangerous, minTier 1), catalog only when allowlisted and never at read tier, SAFE-1 deny + SAFE-5 rows, role gate at `runPlugin`; the Brave request (host, path, `q` / `count` / `safesearch=moderate` / `freshness`, key only in `X-Subscription-Token`, pinned address); usage errors, `not-configured`, SAFE-6 query refusal with nothing sent; fenced hostile hits, count cap, dropped URLs, `(no results)`; the key and the request URL never in any result, error or audit row, a split key never rebuilt (scrub last); Brave error mapping (403 included); abort, unexpected-failure and `--query` usage cases; the owner's own schedule is offered it, a team member's schedule is not. Fails on the base source. |
| `REQ-plugins-3181` | `tests/web.search.test.ts` | http / other host / port / credentials refused before DNS; non-public answers refused before connecting; every redirect refused after one dial, Location not echoed; content type, encoding, byte cap, JSON validity, timeout, abort; network / TLS / DNS failures name the host and a fixed reason only; web-fetch unchanged for any public host. New module (cannot load on main). |
| `REQ-plugins-111` | `tests/web.fetch.test.ts`, `tests/web.search.test.ts` | "registered as a typed builtin" now expects `web-search` to exist as its own command; web-fetch keeps its fixed headers for any public host and every other web-fetch test passes unchanged. Fails on the base source. |
| `REQ-plugins-065` | `tests/roles.team.test.ts`, `tests/web.search.test.ts` | `roleAllowsPlugin` over every plugin with `TEAM_SEARCH_TOOLS` (`web-search` only); the team catalog offers `web-search` (allowlisted) and not `web-fetch`, community never; a community role session is refused at `runPlugin`, a team one reaches the handler. Fails on the base source. |
| `REQ-plugins-113` | `tests/web.search.test.ts` | `fledgeChildEnv` drops `BRAVE_SEARCH_API_KEY` and keeps `PATH`. Fails on the base source. |
| `REQ-agent-002` | `tests/web.search.test.ts`, `tests/agent.verify-env.test.ts` | `isVerifyEnvDropped` / `buildVerifyEnv` drop `BRAVE_SEARCH_API_KEY`; the existing verify-env tests pass unchanged. Fails on the base source. |
| `REQ-agent-117` | `tests/web.search.test.ts`, `tests/autonomous.delegate.test.ts` | `isWorkerEnvDropped` and `buildDelegateSpawn` drop `BRAVE_SEARCH_API_KEY` (no value anywhere in the spawn); existing delegate env tests pass. Fails on the base source. |
| `REQ-agent-071` | `tests/web.search.test.ts`, `tests/safe.injection.test.ts` | `web-search` is in `INJECTION_SCAN_TOOLS`; through `createTaskExecute` an injected description notes the tool message, drops `web-search`, `web-fetch` and `files-write` from the next request, refuses the write, reports one notice and ends the summary with the note; the existing SAFE-13 tests pass. Fails on the base source. |
| `REQ-agent-086` | `tests/agent.loop-guards.test.ts` | Every dangerous or mutating builtin, `web-search` included, is in exactly one of `STATE_CHANGING_TOOLS` / `NO_STATE_CHANGE_TOOLS` (`web-search` in the second). Fails on the base source's sets once `web-search` is registered. |
| `REQ-agent-318` | `tests/web.search.test.ts` | "a reply whose run used web-search ends with 'Search by Brave' …": the map holds only `web-search`; answered searches (two, and a retry) end the reply with the line once and no model request contains it; no line with no search, no key, a 429 or a refused query; a team member's reply carries it; a spend-cap stop after a search shows `SPEND_CAP_SUMMARY` and the line while the ask's question and the owner's stop DM never do; `closingNotesTail`, `chatBodyFromTaskResult`, `resultFrame` and `planAnswerParts` keep it at the end. Fails on the base source. |
| `REQ-agent-098` | `tests/web.search.test.ts`, `tests/agent.spend-ask.test.ts`, `tests/agent.spend.test.ts` | With only `CORVIDINHO_PROVIDER_SPEND_CAPS_USD` set a search is recorded and sent, and a setting that is not valid stops it (SAFE-14); no cap opens no DB; reserve 5000 micro-USD before the request, settle `actual` / `failed` 0 / `estimated` (network, timeout, unreadable 2xx, abort after sending), no row for a run already stopped; at the cap, with an invalid value and with an unavailable ledger nothing is sent and `spendAsk` carries the ask; in the tool loop the attempt ends with `SPEND_CAP_SUMMARY` and the ask after one model call; the existing spend tests pass. Fails on the base source. |
| `REQ-discord-417` | `tests/web.search.test.ts` | `redactSecretEnvValues` and `formatErrorLine` redact the `BRAVE_SEARCH_API_KEY` value. Fails on the base source. |
| `REQ-cli-262` | `tests/preload.operator-data-dir.test.ts` | A child `bun test` started with `BRAVE_SEARCH_API_KEY` set sees none of the run settings (the probe lists the key). Fails on the base source. |
