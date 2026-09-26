# WATCH — GitHub mention/review/assignment ingress

## Deploy choice (documented)

| Mode | When | Status in Corvidinho |
|------|------|----------------------|
| **Poll-first** | Bot/VM **without** a public URL (dogfood default) | **Shipped** — `corvidinho github watch` |
| **Webhook** | Public HTTPS URL + `GITHUB_WEBHOOK_SECRET` available | **Deferred** follow-up (same allowlist → session core) |

Poll avoids exposing a webhook endpoint on the bot VM. Prefer webhook later when a stable public URL exists (HMAC verify → same `routeEvent` path).

## What it does

1. Interval-poll GitHub (Octokit search) for @mentions / issue comments / review requests / **assignments** involving `CORVIDINHO_WATCH_USERNAME`
2. **Allowlist BEFORE session spawn** (ALLOW-1): repo + user gates; empty = deny-all
3. Denied contacts refuse quietly (ALLOW-5) — no session
4. Allowlisted events → session stub keyed by `owner/repo#number` (continue on follow-ups)
5. Spawn `corvidinho task run` (prove-before-done; no `--no-verify`) or echo in dry-run

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
- Shutdown and overlap: poll cycles are single-flight (an interval tick while a
  long agent run is still going is skipped). On SIGINT/SIGTERM the in-flight
  cycle stops before the next event (no new ack or agent spawn), `stop()` waits
  for the current run, then closes the DB.
- One failing event (e.g. `SQLITE_BUSY`) is logged as
  `[watch] event owner/repo#N (id) failed; marked processed` and the cycle moves
  on. If a second watcher on the same data dir replaced an issue's row, the
  latest write wins instead of failing on the unique issue key.
- Not yet: turn persistence/replay, stored conversation summaries, durable
  processed-id/ack dedup (a restart can re-see recent events; they continue the
  persisted session).


## Reliability (REQ-watch-007 + WATCH-RELIABILITY-1..3)

- **Poll cycle log:** every cycle emits  
  `[watch] poll cycle fetched=… new=… started=… continued=… refused=… skipped=…`  
  Errors from `pollOnce` are caught and logged (`[watch] pollOnce error`) — not swallowed by `void`.
- **Auto-ack:** on `start_session` / `continue_session` from an `issue_comment` or `issues` mention whose sender is **not** the watch username, WATCH posts a short GitHub issue comment (Made with Corvidinho footer) **before** spawn, at most once per event id. Skips own-username senders to avoid self-loops. Dry-run uses an echo ack client (no live post).
- **Run summary (WATCH-RELIABILITY-1):** after a **successful** auto-ack, when the agent run finishes (success or failure), WATCH posts a short summary comment on the same thread, once per event id (Made with Corvidinho footer).
- **Spawn outcome log (WATCH-RELIABILITY-2):** each spawn emits structured  
  `[watch] spawn start …` / `[watch] spawn outcome event=… exit=… error_class=… duration_ms=…`  
  and appends a JSONL record (default `~/.local/share/corvidinho/watch-spawn.jsonl`, override `CORVIDINHO_WATCH_SPAWN_LOG`) so ops can read outcomes without Discord.
- **GitHub 403 rate-limit backoff (WATCH-RELIABILITY-3):** on 403 rate-limit (or 429), WATCH backs off using `Retry-After` or `x-ratelimit-reset`, else a documented **60s** default; skips tight re-poll while backing off; logs  
  `[watch] github rate-limit backoff ms=… until=… reason=…`.
- **Ignore own mentions:** comments and issue-body mentions authored by `CORVIDINHO_WATCH_USERNAME` are omitted from fetched events.
- **Search pagination bury risk:** Octokit search uses `per_page=100` sorted by `updated` desc. An org-wide qualifier (`org:… involves:…`) can still return more than one page of Corvidinho (or other) noise and **bury** pings on quieter repos (e.g. arcsite) past the first page. Prefer an explicit `repos` allowlist for critical targets, or accept that deep pages are not scanned in this thin slice.

HI: [`hi/watch.md`](../hi/watch.md).

**Assignee ingress (#48):** when the watch username appears in issue/PR `assignees` (from search results), WATCH emits an `assignment` event — same allowlist → session path as mentions. Dogfood can use assign *or* @mention.

**PR review reads (GITHUB-3, #93):** read-only `github-pr-diff <n> --repo OWNER/REPO [--file PATH]` (unified diff, capped at 200 KiB with a `[corvidinho: diff truncated …]` marker; `--file` returns one file's section) and `github-pr-files <n> --repo OWNER/REPO [--limit N]` (changed files with status / additions / deletions; default 300, max 3000, `truncated` flag). Not dangerous (minTier 0) but still behind the GITHUB-6 repo gate. Returned text is secret-scrubbed (SAFE-6; diffs are first cut at 800 KiB so a hostile diff cannot stall the scrub) and labelled untrusted PR content — data to review, never instructions. The review itself still goes through `github-pr-review`.

**Outbound writes (GITHUB-2/3/5):** dangerous plugins `github-issue-create`, `github-issue-comment`, `github-pr-create`, `github-pr-review` — require `CORVIDINHO_ALLOWLIST` in non-interactive mode + non-empty GitHub repo allowlist. PR bodies get a plain Made with Corvidinho footer (no @handles). Set `CORVIDINHO_GITHUB_DRY_RUN=1` for local dry-run.

Not in this slice: auto-merge, auto-update, CI-retry, live webhook server.

## Go-live (poll)

```bash
export GITHUB_TOKEN=…                 # or GH_TOKEN — secret store; never commit
export CORVIDINHO_WATCH_USERNAME=corvid-agent   # login you listen for
# Non-empty GitHub allowlists (file and/or env):
export CORVIDINHO_GITHUB_ALLOW_REPOS=CorvidLabs/Corvidinho
export CORVIDINHO_GITHUB_ALLOW_ORGS=CorvidLabs
export CORVIDINHO_GITHUB_ALLOW_USERS=0xLeif
# Optional:
# export CORVIDINHO_WATCH_INTERVAL_MS=60000
# export CORVIDINHO_WATCH_DRY_RUN=1
# export CORVIDINHO_WATCH_SPAWN_LOG=~/.local/share/corvidinho/watch-spawn.jsonl

bun src/cli.ts github watch
# or: corvidinho github watch
```

Copy shape from [`allowlist.example.toml`](../allowlist.example.toml) → `~/.config/corvidinho/allowlist.toml`.

## CI

Fixture tests under `tests/watch.*.test.ts` — **no live webhook secrets** required.
