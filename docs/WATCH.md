# WATCH — GitHub mention/review/assignment ingress

## Deploy choice (documented)

| Mode | When | Status in Corvidinho |
|------|------|----------------------|
| **Poll-first** | Bot/VM **without** a public URL (dogfood default) | **Shipped** — `corvidinho github watch` |
| **Webhook** | Public HTTPS URL + `GITHUB_WEBHOOK_SECRET` available | **Deferred** follow-up (same allowlist → session core) |

Poll avoids exposing a webhook endpoint on the bot VM. Prefer webhook later when a stable public URL exists (HMAC verify → same `routeEvent` path).

## What it does

1. Interval-poll GitHub (Octokit search) for @mentions / issue comments / review requests / **assignments** involving `CORVIDINHO_WATCH_USERNAME`
2. **Allowlist BEFORE session spawn** (ALLOW-1): repo + user gates; empty = deny-all. For review requests and assignments the user gate checks both the thread author and the user who requested the review / assigned the watch user (REQ-watch-302); deny lists win
3. Denied contacts refuse quietly (ALLOW-5) — no session
4. Allowlisted events → session stub keyed by `owner/repo#number` (continue on follow-ups)
5. Spawn `corvidinho task run` (prove-before-done; verification can't be skipped, AGENT-14) or echo in dry-run

**Declared people (IDENTITY-14 / IDENTITY-7 / IDENTITY-7.a, #36):** the commenter is recognised
from the owner's `[people.<id>]` entries in the allowlist file the watch loaded
(the file `[owner]` comes from), by the GitHub numeric user id the API reports
for the event only (IDENTITY-7.a) — never a login, which can be renamed or
re-registered, and never a name. An event with no id, or an id nobody declared,
is an undeclared commenter (community), never the owner or a declared person.
Entries with only `github_logins` still load but are not recognised here until
an id is linked (`github_ids`, `[owner] github_id`, or `/admin people link
person:<id> github:<login>`; `corvidinho doctor` warns). The
run prompt then opens with a `[Corvidinho acting GitHub user …]` paragraph
(`declared_person`, `display_name`, `nicknames`; the owner is recognised by
their numeric id — `[owner] github_id`, or `github_ids` on the owner's declared
person — and marked `role: owner`, a team member `role: team`, with a note
saying whether this run has that role's tools — see "Roles on GitHub" below).
Once anyone is declared, an undeclared commenter is marked
`declared_person: none`; with only the owner configured, so is a commenter
using the owner's `[owner] github_login` without the owner's numeric id (a
renamed or re-registered login never passes for the owner unsaid). People are re-read per event, so VM edits and
`/admin people` changes apply without restarting the watch. See
[`discord.md`](discord.md) "Declared people".

**Roles on GitHub (IDENTITY-12.a, #65):** a WATCH run gets the declared role
of the person who **triggered** it — the author of the comment (or of the
issue / PR body) that @mentioned the watch user, matched by the GitHub numeric
user id the API reported, in the owner's people list (`watchTriggerRole`,
`src/watch/router.ts`). Never by a login (a re-registered owner login is
community), never by a name, and never the thread author's role when someone
else triggered the run: an **assignment** or **review request** is started by
whoever assigned or requested (known by login only), so it is always
community. The spawn stamps that role exactly like a Discord run —
`CORVIDINHO_ACTING_IS_ADMIN=1` and `CORVIDINHO_ACTING_ROLE=owner` for the
owner, `CORVIDINHO_ACTING_ROLE=team` for a team member, else `0` / community;
never a `/work` task (`CORVIDINHO_ACTING_WORK_TASK=0`), always overwritten —
and the tool layer (`src/plugins/roles.ts`) re-resolves it from the GitHub
numeric id (`CORVIDINHO_ACTING_GITHUB_ID`) on every call: a role change in the
people list, a GitHub `deny_users` entry (login or id), or the person's
Discord id muted or deny-listed applies to the next call, and a stamp, a login
or a Discord id alone never raises it.

| Who triggered the run | Tools on GitHub |
|---|---|
| **Owner** (`[owner] github_id`, or `github_ids` on the owner's person) | The owner's tools (IDENTITY-9), behind the same must-ask gate: a must-ask call (a `git-push` to the default branch, a `discord-post-message`) waits for the owner's Approve card, which the Discord bridge DMs to the owner (the watch process and the bridge share `CORVIDINHO_DATA_DIR`); no answer or a deny runs nothing (SAFE-20). |
| **Team** (`role = "team"` and a `github_ids` entry) | The team's tools (IDENTITY-10): every read tool, reviews (`github-issue-comment`, `github-pr-review` as `COMMENT`, allowlisted repos only), their own memory (MEMORY-8), `web-search` / `gif-search` when allowlisted. File edits stay `/work`-only (start a `/work` on Discord). |
| Anyone else — undeclared, declared community, no numeric id, a re-registered login, every assignment and review request | Community, as before: read/chat tools only. |

What stays the same for every role on GitHub: the shell, the runners, the
Fledge runs and discovered Fledge plugin commands are never offered
(SAFE-3.a); secret-looking paths (`.env*`,
`.ssh`, keys, keystores) stay hidden from the file, search and git tools, the
owner's runs included, because the answer goes to a public thread
(ROLES-CHAT-8); the owner's `--person` memory view, private notes and profiles
are never read there (MEMORY-7.a); WATCH runs never approve or archive a
SpecSync change (AGENT-18.a); `delegate` / `council` workers are community; and
the thread's title and body stay fenced untrusted data (SAFE-12).

**Untrusted text (SAFE-12 / SAFE-13, #71):** the issue / PR / comment title
and body go to the model inside an `UNTRUSTED_DATA` fence (clipped first, so
the end marker, which carries a random id, always survives the ~8000-char
prompt cap); the run treats them as data, and what it may run is decided by
its role (the trigger's declared role, IDENTITY-12.a — see "Roles on GitHub"). Before any ack or run, the same
conservative detector as Discord checks the title and body of every event not
sent by the owner (recognised by the owner's numeric id only, never the login —
a re-registered owner login is checked like anyone else): on a hit WATCH posts one
comment saying it won't act on it and why (plain words, never quoting the
text), @mentioning the owner's GitHub login from `[owner]` /
`CORVIDINHO_OWNER_GITHUB_LOGIN` when set, appends an `injection-suspected`
audit row (actor `github:<login>`, surface `watch:<session>`, `denied`), logs
`[watch] SAFE-13 refused …`, marks the event handled and runs nothing. A run
whose tool result trips the detector drops its mutating tools and
`memory-store` for the rest of the run, and its summary comment @mentions the
owner (an event WATCH does not ack, such as an assignment or review request,
gets one comment of its own saying so). See
[`discord.md`](discord.md) "Untrusted text and injection attempts".

## Durable sessions (REQ-watch-037, #37 slice 1)

- WATCH sessions (`owner/repo#number`) persist in the shared SQLite DB
  (`~/.local/share/corvidinho/corvidinho.db`, override `CORVIDINHO_DATA_DIR`),
  table `watch_sessions` (schema v6). A `github watch` restart keeps live issue
  sessions; startup logs `[watch] sessions: N restored (soft TTL Xm)`.
- Same soft TTL as Discord (SESSION-1..3): `CORVIDINHO_SESSION_TTL_MS`, clamped
  to 30–60m, default 45m. Each event on the issue keeps the session alive; an
  issue idle past the TTL starts a fresh session. Cross-session continuity comes
  from MEMORY (SESSION-4), not from a long-lived session.
- Stored topic (issue title) is SAFE-6 scrubbed. Dry-run without
  `CORVIDINHO_DATA_DIR` stays in-memory.
- Thread conversation (REQ-watch-472, AGENT-6.a / SESSION-5): each run on an
  issue or PR adds the event and the run's answer to that thread's kept
  conversation (`conversation_threads`, schema v13; scrubbed, last 20 turns
  plus a condensed summary). A follow-up on the same issue or PR — also after
  the session's TTL — gets it replayed ahead of the new event in a
  `[Corvidinho earlier conversation on this GitHub issue or PR …]` block,
  condensed at about 80% of the model's window (`CORVIDINHO_LLM_CONTEXT_TOKENS`,
  default 8192; the thread's opening and latest request word for word). It is
  purged 30 days after its last update; forgetting a person deletes the
  threads they started or commented on (by GitHub login, and by numeric id
  for threads kept from now on).
- Shutdown and overlap: poll cycles are single-flight (an interval tick while a
  long agent run is still going is skipped). On SIGINT/SIGTERM the in-flight
  cycle stops before the next event (no new ack or agent spawn), `stop()` waits
  for the current run, then closes the DB.
- One failing event (e.g. `SQLITE_BUSY`) is logged as
  `[watch] event owner/repo#N (id) failed; marked processed` and the cycle moves
  on (`not marked, retried next cycle` when the id write itself failed; nothing
  ran for it). If a second watcher on the same data dir replaced an issue's row,
  the latest write wins instead of failing on the unique issue key.
- Handled event ids (processed, acked, summarized) persist in the same DB,
  table `watch_event_ids` (REQ-watch-247), so a restart never re-runs, re-acks
  or re-summarizes an event it already handled. Denied ids (non-allowlisted
  senders) are kept apart, in memory only: a stranger's mention flood cannot
  push a handled trusted id out, and after a restart it is just refused again.
- Not yet: turn persistence/replay, stored conversation summaries.


## Reliability (REQ-watch-007 + WATCH-RELIABILITY-1..3)

- **Poll cycle log:** every cycle emits  
  `[watch] poll cycle fetched=… new=… started=… continued=… refused=… skipped=…`  
  Errors from `pollOnce` are caught and logged (`[watch] pollOnce error`) — not swallowed by `void`.
- **Auto-ack:** on `start_session` / `continue_session` from an `issue_comment` or `issues` mention whose sender is **not** the watch username, WATCH posts a short GitHub issue comment (Made with Corvidinho footer) **before** spawn, at most once per event id. Skips own-username senders to avoid self-loops. Dry-run uses an echo ack client (no live post).
- **Run summary (WATCH-RELIABILITY-1):** after a **successful** auto-ack, when the agent run finishes (success or failure), WATCH posts a short summary comment on the same thread, once per event id (Made with Corvidinho footer). The summary (≤1200 chars) and the spawn-log preview (≤240) are SAFE-6 scrubbed before they are clipped, so a cap never leaves half a secret. A summary that ends with the `(not allowed for your role)` line (ROLES-CHAT-3) keeps it when the comment clips it: the text before it loses its end. **A failed run says why in one plain line (REQ-watch-009, the DISCORD-3.b reason):** when the run fails without a question of its own (it exits non-zero, or the spawn throws), the comment under `Failed (exit N).` is one line — e.g. `The model call failed (429 Too Many Requests)` or the AGENT-10 no-provider notice — never the run's summary, so a provider's reply body (account or org names, request ids, quota details) never lands on the public thread. The line is the `task run` result's `error` (which model call failed and how; the no-provider notice; which verify failed), else the no-provider notice for the run's tier, else the last meaningful line of the run's stderr, else the exit code; SAFE-6 scrubbed, stack frames and host paths dropped, at most 200 characters (`src/discord/failure-reason.ts`). A model-call line loses the provider's host on the thread (`watchPublicFailureLine`): a host can be the account's own resource name (`<resource>.openai.azure.com`), a private gateway or an Ollama server's address. The watcher logs the line with the host, `[watch] run failed (<owner/repo>#<n> id=<event id>, exit N): The model call failed (429 Too Many Requests from api.openai.com)` (no `, exit N` for a spawn that threw), and the thread's kept conversation stores the comment's line (no host) as the run's answer. The operator-only spawn log (`summaryPreview`, below) keeps the scrubbed run summary for diagnosis. A failed run that stopped on a question keeps its summary (`Needs your input: …`, AGENT-16.a), and a successful run's comment is unchanged.
- **Spawn outcome log (WATCH-RELIABILITY-2):** each spawn emits structured  
  `[watch] spawn start …` / `[watch] spawn outcome event=… exit=… error_class=… duration_ms=…`  
  and appends a JSONL record (default `<data dir>/watch-spawn.jsonl` — data dir = `CORVIDINHO_DATA_DIR` or `~/.local/share/corvidinho`; override `CORVIDINHO_WATCH_SPAWN_LOG`) so ops can read outcomes without Discord.
- **Turn cap and idle timeout (AGENT-12):** WATCH runs use the same `CORVIDINHO_MAX_TURNS` (model/tool rounds per attempt, default 8) and `CORVIDINHO_IDLE_TIMEOUT_MS` (default 600000) as every other run. A run whose last attempt hit the turn cap posts its best answer so far followed by the plain line `Stopped: it reached the turn cap before it finished, so this is its best answer so far.` (a turn-capped run that failed posts its one reason line instead, above, without it); a run stopped for no output fails, and its summary comment's one reason line is `Stopped: no output for 10 minutes (idle timeout).`
- **Model fallback (AGENT-11):** a run whose model failed and fell back to the next configured model logs one warn line, `[watch] llm.fallback: <a> failed (<reason>), fell back to <b> (session <id>)`, and its summary comment ends with the `(model fallback: …)` note, which the comment's clip keeps (a run that failed after failing over posts its one reason line instead, above). No DM.
- **GitHub 403 rate-limit backoff (WATCH-RELIABILITY-3):** on 403 rate-limit (or 429) from the poll fetch, the auto-ack comment or the run-summary comment, WATCH backs off using `Retry-After` or `x-ratelimit-reset`, else a documented **60s** default; skips tight re-poll while backing off; logs  
  `[watch] github rate-limit backoff ms=… until=… reason=…`  
  (for a comment, right after its `[watch] ack failed …` / `[watch] summary failed …` line). A plain 403 on a comment (no rate-limit signal) only logs the failure. A failed ack or summary is not retried.
- **GitHub 401 (bad or revoked token, REQ-watch-418):** WATCH stops polling instead of retrying forever, logs one line  
  `[watch] github auth failed (401): … — check GITHUB_TOKEN / GH_TOKEN; watch stopped`  
  and `corvidinho github watch` exits 1. Other poll errors print one scrubbed line each (`[watch] pollOnce error: …`, SAFE-6) and polling continues.
- **Ignore own mentions:** comments and issue-body mentions authored by `CORVIDINHO_WATCH_USERNAME` are omitted from fetched events.
- **Search pagination bury risk:** Octokit search uses `per_page=100` sorted by `updated` desc. An org-wide qualifier (`org:… involves:…`) can still return more than one page of Corvidinho (or other) noise and **bury** pings on quieter repos (e.g. arcsite) past the first page. Prefer an explicit `repos` allowlist for critical targets, or accept that deep pages are not scanned in this thin slice.

HI: [`hi/watch.md`](../hi/watch.md).

**Assignee ingress (#48):** when the watch username appears in issue/PR `assignees` (from search results), WATCH emits an `assignment` event — same allowlist → session path as mentions. Dogfood can use assign *or* @mention.

**Who assigned / requested (REQ-watch-302, ALLOW-1/2):** an `assignment` or `review_request` event is started by whoever assigned the watch user or requested its review, who need not be the thread author. WATCH reads that user from the issue's events (the newest `assigned` / `review_requested` event naming the watch user: `assigner` / `review_requester`, else the event `actor`) and runs the event only when **both** the author and that user pass the GitHub user allowlist and neither is on `deny_users`. Such a run is community whoever the author is (IDENTITY-12.a: the author did not trigger it, and the event names the assigner by login only). If that user is not allowlisted, is denied, or cannot be read (API error, no such event), the event is refused quietly: no session, no ack, no run. A collaborator who is not allowlisted cannot start a run by assigning Corvidinho to (or requesting its review on) an allowlisted author's issue or PR. Assignments made by bots or GitHub Actions need that bot's login on the user allowlist.

**What a WATCH run can do:** the role of the person who triggered it (IDENTITY-12.a, "Roles on GitHub" above): the owner's or the team's tools for a recognised owner or team member, behind the same must-ask gate; community — read/chat tools only, no dangerous or mutating tool (`CORVIDINHO_ACTING_IS_ADMIN=0`, ROLES-CHAT) — for anyone else. They have no Discord actor; the poller passes the commenter's GitHub login / numeric id and the thread's repo instead (`CORVIDINHO_ACTING_GITHUB_LOGIN` / `_ID` / `_REPO`, from the GitHub API event, never from the text), and the memory plugins act for the commenter's **declared person** (MEMORY-8): someone on the owner's people list (matched by GitHub numeric user id only, IDENTITY-7 / IDENTITY-7.a) saves and recalls their own profile with `memory-store` / `memory-recall` — the same profile as on Discord. Anyone not on the list gets community scope: the thread repo's project memory read-only (`memory-recall --project`, keyed by the repo's `owner/repo`) and nothing saved. From GitHub, project memory is never written, `--person` is refused, private notes and profile reads (`memory-profile`) are never read (the thread is public; they are shown only privately, MEMORY-7 / MEMORY-7.a) and the `memory-forget-me` tool is refused (it points at the "forget me" comment below). Before each run the poller searches memory for the comment — the commenter's profile and the repo's project memory, most relevant first (MEMORY-9) — and prepends what it found (`[Corvidinho memory for this GitHub user …]` / `[Corvidinho project memory …]`), logging `[watch] memory inject: N recalled for @login`.

**Forget me from GitHub (MEMORY-ACL-6.a, #101):** a comment (or issue body) from an allowlisted user on an allowlisted repo that @mentions the watch user and says just "forget me" — or "forget / delete everything (you know) about me", with please / can you / thanks at most; quoted lines don't count — is handled by the poller itself: no ack, no model run, and it never hides another request on the same issue. The sender is matched in the owner's people list by their **GitHub numeric id** only (IDENTITY-7; a login alone never counts). A declared person's ask becomes the same forget request as a Discord ask (SAFE-5 `memory-forget-request` rows, actor `github:<login>`, surface `watch:forget-me`; one open ask per person) and the Discord bridge DMs the owner the same **Approve / Deny** card; nothing is deleted until the owner approves. The thread gets one reply: the request went to the owner (or is already waiting); or, for someone not on the list, that nothing is kept for them and no request was made; or, for a login on the list without its account id, that it can't be confirmed. Once the owner decides (or the ask lapses after 24 h), the next poll posts the outcome on that thread while its repo is still allowlisted (never a count or any content), giving up a day after the decision. The watch process and the bridge must share the data dir (`CORVIDINHO_DATA_DIR`) — and the audit key, if set — for the card to reach the owner. The owner can also start a forget for any declared person with `/admin people forget` ([`discord.md`](discord.md)).

**Stuck runs ping the owner on Discord (AGENT-16.a, #86):** a run that ends with a stuck question — the same tool call kept failing with nothing changed even after it was told to change approach (AGENT-16), or verification still fails after every retry (AUTONOMY-2) — is handed to the Discord bridge for every event type (assignments and review requests post no summary comment): the poller records the question (SAFE-6 scrubbed, one per issue or PR, a newer one replaces it, a later run there that is not stuck drops it) in the shared DB and the bridge DMs it to the owner with a link to the thread, where the owner answers ([`discord.md`](discord.md) "Stuck GitHub runs"). The watch process and the bridge must share the data dir (`CORVIDINHO_DATA_DIR`). One log line per stuck run: `[watch] stuck ask owner/repo#N id=…: queued for the owner's Discord ping (AGENT-16.a)`, or, with no bridge running on the data dir, `… the owner's Discord ping could not be sent — no Discord bridge is running on this data dir (CORVIDINHO_DATA_DIR); it is sent if one starts within a day; …`, or, with no owner Discord id configured, that it could not be sent (nothing kept). The run summary comment (ackable events after a successful ack) still carries the question as `Needs your input: …`. A clarify question stays the commenter's to answer on the thread and is not sent to the owner.

**Spend-cap stops reach the owner too (AUTONOMY-8, #98):** a run that stops at a spend cap (no owner to raise a spend card, a card that came to no, a bad cap setting) is handed over the same way (reason `spend-cap`). Its GitHub comment says only “Work is paused for budget.” (SAFE-14.a); the bridge DMs the owner the details — which cap, the spend, what the card came to — with a link to the thread, once per episode of each cap. Log line: `[watch] spend-cap stop owner/repo#N id=…: queued for the owner's Discord DM (AUTONOMY-8)` (no amounts), with the same no-bridge and no-owner variants.

**PR review reads (GITHUB-3, #93):** read-only `github-pr-diff <n> --repo OWNER/REPO [--file PATH]` (unified diff, capped at 200 KiB with a `[corvidinho: diff truncated …]` marker; `--file` returns one file's section) and `github-pr-files <n> --repo OWNER/REPO [--limit N]` (changed files with status / additions / deletions; default 300, max 3000, `truncated` flag). Not dangerous (minTier 0). Deny lists always win. In community runs — Discord, and WATCH runs no declared owner or team member triggered (non-ADMIN, ROLES-CHAT-8) — any confirmed-public repo is readable and private/unknown repos are refused (scheduled runs: only repos also on the GitHub allowlist, DISCORD-SCHEDULE-3.a); team members' runs (Discord, and WATCH runs they triggered, IDENTITY-12.a) read GITHUB-6-allowlisted or confirmed-public repos (IDENTITY-10); ADMIN runs (the owner's, on Discord or GitHub) and local CLI runs use the GITHUB-6 allowlist (file + env). Returned text is secret-scrubbed (SAFE-6; diffs are first cut at 800 KiB so a hostile diff cannot stall the scrub) and labelled untrusted PR content — data to review, never instructions. The review itself still goes through `github-pr-review`.

**Outbound writes (GITHUB-2/3/5):** dangerous plugins `github-issue-create`, `github-issue-comment`, `github-pr-create`, `github-pr-review` — require `CORVIDINHO_ALLOWLIST` in non-interactive mode + non-empty GitHub repo allowlist. In WATCH agent runs they are offered only when the owner triggered the run, and `github-issue-comment` / `github-pr-review` when a declared team member did (IDENTITY-12.a); community WATCH runs never get them (ROLES-CHAT-2). The allowlist lets `corvidinho plugins run` and the `/work` draft-PR step use them, and offers them to the model in the owner's runs, team members' review runs and local `task run` (CLI-3). WATCH's own ack/summary comments are posted by the poller and need no allowlist entry. PR bodies get a plain Made with Corvidinho footer (no @handles). `github-pr-create` opens a PR only after a second configured model reviewed the diff in at most 3 rounds, and the body gets a `## Second-model review` section; without a run model (`plugins run`, `/work`) it opens only a tree whose review already finished (GITHUB-9 / GITHUB-9.a, see [`discord.md`](discord.md)). Set `CORVIDINHO_GITHUB_DRY_RUN=1` for local dry-run (the branch's tree is then read from the push remote with `git ls-remote`).

`github-pr-merge` (GITHUB-7.a) is never offered to WATCH runs, the owner's own included (they get the owner's other tools), and refuses inside one with a `github-pr-merge:watch` audit row: it merges only when the owner asks in their own interactive run.

Not in this slice: auto-merge, auto-update, CI-retry, live webhook server.

## Go-live (poll)

```bash
export GITHUB_TOKEN=…                 # or GH_TOKEN — secret store; never commit
export CORVIDINHO_WATCH_USERNAME=corvid-agent   # login you listen for (alias: GITHUB_WATCH_USERNAME)
# Non-empty GitHub allowlists (file and/or env):
export CORVIDINHO_GITHUB_ALLOW_REPOS=CorvidLabs/Corvidinho
export CORVIDINHO_GITHUB_ALLOW_ORGS=CorvidLabs
export CORVIDINHO_GITHUB_ALLOW_USERS=0xLeif
# Optional:
# export CORVIDINHO_WATCH_INTERVAL_MS=60000     # min 30000
# export CORVIDINHO_WATCH_MAX_TRIGGERS=5        # max agent spawns per poll cycle (the rest count as skipped)
# export CORVIDINHO_WATCH_DRY_RUN=1             # or true
# export CORVIDINHO_WATCH_SPAWN_LOG=/path/to/watch-spawn.jsonl   # default <data dir>/watch-spawn.jsonl

bun src/cli.ts github watch
# or: corvidinho github watch
```

Copy shape from [`allowlist.example.toml`](../allowlist.example.toml) → `~/.config/corvidinho/allowlist.toml`.
`github watch` refuses to start when the token, the username or the repo/org allowlist is
missing, and when an allowlist file exists but cannot be parsed (fail closed; `corvidinho doctor`
names the line and key). `GITHUB_TOKEN` wins over `GH_TOKEN` when both are set; a blank (whitespace-only) one counts as
unset, for WATCH, the Octokit plugins and `corvidinho doctor` alike.

## CI

Fixture tests under `tests/watch.*.test.ts` — **no live webhook secrets** required.
