---
module: plugins
change:
scheduled-runs-read-and-act-only-on-repos-the-owner-allowlists-even-public-ones-discord-schedule-3-a-in-a-schedule-run
---

# Delta: plugins (DISCORD-SCHEDULE-3.a: scheduled runs use allowlisted repos only)

## Added

### REQUIREMENT REQ-plugins-496

Scheduled runs SHALL read and act only on GitHub-allowlisted repos, even
public ones (DISCORD-SCHEDULE-3.a). `src/plugins/roles.ts` SHALL export
`SCHEDULE_SESSION_PREFIX` (`"schedule_"`) and `isScheduleRunEnv(env)`, true
exactly when `CORVIDINHO_DISCORD_SESSION_ID` starts with the prefix; the
scheduler SHALL build every run's session id as the prefix plus the schedule
id, and `delegate` / `council` workers SHALL keep that key (the worker env
drops only `DISCORD_*`, `CORVIDINHO_ACTING_*` and the token keys), so a
worker of a scheduled run is one too. In such an env
`checkRepoGateForActingRole` SHALL, after the deny lists and before the role
rules, refuse a repo that fails `checkGithubRepo` (the GITHUB-6 allowlist,
deny wins, empty allow refuses) for every role, with no visibility lookup,
and the error SHALL name DISCORD-SCHEDULE-3.a; a repo that passes SHALL still
go through the role rules (a community run's reads need a confirmed-public
repo, its writes stay refused, ROLES-CHAT-3/8). This one gate SHALL cover
every `github-*` command, `github-pr-diff` / `github-pr-files` and
`github-docs-read` / `github-milestone-list`. `web-fetch` in such an env SHALL
refuse (`blocked`, exit 2), in its shared per-hop URL rule (the first hop and
every redirect target, before DNS or any connection), a URL whose host is
`github.com`, a `*.github.com` host, `githubusercontent.com` or a
`*.githubusercontent.com` host unless it names an `OWNER/REPO` that passes
`checkGithubRepo`: only `/<owner>/<repo>/…` on `github.com`, `www.github.com`,
`codeload.github.com` and `raw.githubusercontent.com`, and
`/repos/<owner>/<repo>/…` on `api.github.com` (segments percent-decoded, a
trailing `.git` dropped, `[A-Za-z0-9._-]` only, not `.` or `..`) name one; the
allowlist SHALL be read once per call for the run's env (`tryLoadAllowlist`)
and an unreadable one SHALL refuse every GitHub hop. The refusal SHALL name
only the host, never the path. Other hosts, and runs whose session id is not
`schedule_*` (chat, `/work`, WATCH, the local CLI), SHALL be unchanged. No
env var, config key, command, table, column or schema version.

Acceptance Criteria
- `isScheduleRunEnv` is true for a `schedule_*` session id and false for `sess_*`, `work_*`, `wsess_*`, empty and unset; the scheduler's run session id is `SCHEDULE_SESSION_PREFIX` plus the schedule id; `buildDelegateSpawn` from a schedule lead (owner or community stamp, and a council voice env) keeps it.
- In a schedule env a public repo off the allowlist is refused for the owner and community stamps and for a worker env, naming DISCORD-SCHEDULE-3.a, without calling the visibility lookup; an allowlisted repo passes; a denied repo is refused; a community write on an allowlisted repo is refused (ROLES-CHAT-3) and a community read of an allowlisted private repo is refused (ROLES-CHAT-8), while the owner stamp reads it; a `sess_*` community chat still reads the public repo.
- `github-pr-list`, `github-issue-list`, `github-pr-diff`, `github-pr-files`, `github-docs-read` and `github-milestone-list` in a schedule env refuse a public off-list repo with exit 3 and send no GitHub request.
- `web-fetch` in a schedule env refuses GitHub-host URLs of an off-list repo (github.com in any case or with a trailing dot, www, api `/repos/`, codeload, raw.githubusercontent.com), gists, other GitHub hosts, GitHub paths naming no repo and a denied repo, before DNS; allowlisted repos and other hosts fetch; a redirect into raw.githubusercontent.com for an off-list repo, and an allowlisted GitHub URL redirecting off the list, are refused on that hop; an unreadable allowlist refuses GitHub hops only; outside a schedule env the same URLs fetch; the handler passes the run's env (exit 2 in a schedule env).
- Regression tests in `tests/github.schedule-repo-gate.test.ts` fail on the base sources and pass after.

## Modified

### REQUIREMENT REQ-plugins-065

The plugin layer SHALL gate every mutating plugin by the acting role —
owner, team or community (IDENTITY-8..12, #65) — resolved at every call by
`resolveActingRole(env)` (`src/plugins/roles.ts`), never from the prompt:
`null` outside a role session (`CORVIDINHO_ACTING_IS_ADMIN` unset: local CLI,
no role gate); `owner` when the ADMIN re-check passes (`resolveActingIsAdmin`:
bridge bit + configured owner, not muted or deny-listed — IDENTITY-9, as
ROLES-CHAT-4); `team` only when the spawning surface allows it
(`CORVIDINHO_ACTING_ROLE` is `team`, or `owner` for a caller no longer the
owner; with no stamp the ADMIN bit alone caps at owner, `actingRoleCap`) AND
the acting Discord user id, matched in the owner's people list re-read now
(`loadDeclaredPeople` + `resolvePerson`, stable ids only), is a person whose
role is team, not muted (`DISCORD_MUTED_USER_IDS`) and not on
`[discord].deny_users`; else `community` — undeclared, declared community or
without a role, WATCH / schedules / workers (community stamp or no actor), and
any read failure. A stamp never raises the role. `roleAllowsPlugin(role, cmd,
workTask)` SHALL be the one rule: read plugins for every role; mutating
plugins (`isMutatingPlugin`) for the owner and `null`; for team only
`TEAM_REVIEW_TOOLS` (`github-issue-comment`, `github-pr-review`) plus, when
`CORVIDINHO_ACTING_WORK_TASK` is truthy (a `/work` run), `TEAM_WORK_TOOLS`
(`files-write`, `files-edit`); for community none (IDENTITY-10/11).
`runPlugin` SHALL refuse a mutating plugin the role does not allow with the
existing `Denied: plugin "<name>" is not allowed for your role
(ROLES-CHAT-3).` (exit 2) before SAFE-1, the audit row or the handler; SAFE-1,
SAFE-2, SAFE-5 and the memory ACL (forget / override stay owner-only,
REQ-plugins-011) still apply to whatever the role allows. A team review is
feedback: `github-pr-review` SHALL refuse `--event APPROVE` and
`REQUEST_CHANGES` with the role refusal (exit 2, naming IDENTITY-10) unless
the role, re-resolved at that call, is owner or there is no role session, so
a team member never gets an approval that counts toward, or a review that
blocks, a merge. In a team `/work` run `files-write` and `files-edit` SHALL
refuse a secret-looking path (`isSecretPath`, as named or as resolved; exit
2, ROLES-CHAT-8) like the read tools, so an edit is never a read oracle for a
secret file; the owner and the local CLI keep it.
`checkRepoGateForActingRole(repo, { write })` SHALL keep deny lists first,
then: team reads pass on a GITHUB-6-allowlisted repo or a confirmed-public one;
team writes (`write: true`, passed by `github-issue-create`,
`github-issue-comment`, `github-pr-create`, `github-pr-review`) pass only on an
allowlisted repo; community reads keep the confirmed-public path
(ROLES-CHAT-8) and community writes are refused; owner and `null` keep the
GITHUB-6 allowlist. Secret-path hiding (REQ-plugins-267) keeps treating team
like community. No new table, column or schema version; the two env keys are
internal, set only by the Discord spawn client.
In a scheduled run (`isScheduleRunEnv`, REQ-plugins-496)
`checkRepoGateForActingRole` SHALL first refuse, after the deny lists, a repo
off the GITHUB-6 allowlist for every role with no visibility lookup
(DISCORD-SCHEDULE-3.a); the role rules above then apply unchanged to what
passes.

Acceptance Criteria
- A `role = "team"` person with a team stamp resolves team; the same person with a community stamp, no stamp, muted, deny-listed or demoted in the file resolves community at the next call; an owner stamp for a team person resolves team; undeclared, declared-community and no-role people resolve community even with a team stamp; the owner with the bridge bit resolves owner; no role session resolves null; an unreadable allowlist file resolves community.
- `roleAllowsPlugin` allows every read plugin for every role, every plugin for owner and null, only the review tools (plus the work tools with the work flag) of the mutating plugins for team, none for community.
- As team, `github-issue-comment` and `github-pr-review` run (dry-run) on an allowlisted repo and a non-allowlisted repo gets GITHUB-6; every other mutating plugin gets the role refusal; `files-write` runs only with the work flag and SAFE-2 still refuses `.env`; memory store/recall stay in the actor's scope, forget/override are refused.
- As team, `github-pr-review --event COMMENT` runs and `APPROVE` / `REQUEST_CHANGES` (any case) get the role refusal naming IDENTITY-10; the owner runs all three events.
- In a team `/work` run `files-write` refuses `credentials.json`, `id_rsa`, `*.pem` and `.ssh/…`, and `files-edit` on a secret file refuses without saying whether the old string matched, leaving the file unchanged; the owner edits it.
- Team reads pass on an allowlisted or confirmed-public repo and are refused on a private non-allowlisted one; team writes on a public non-allowlisted repo are refused; community writes are refused; deny lists win.
- Every existing ROLES-CHAT test passes unchanged; regression tests in `tests/roles.team.test.ts` fail on the base sources and pass after.
- In a scheduled run a public repo off the allowlist is refused for every role before any visibility lookup, and the role rules still apply to an allowlisted one (`tests/github.schedule-repo-gate.test.ts`).

### REQUIREMENT REQ-plugins-493

In a non-ADMIN role session (`CORVIDINHO_ACTING_IS_ADMIN` set and the acting
user not the admin owner), the GitHub repo gate (`checkRepoGateForActingRole`,
used by the GitHub plugins and review reads) SHALL admit a repo only when its
visibility is confirmed public (ROLES-CHAT-8), after the deny lists. Without
an injected lookup it SHALL ask GitHub through the Octokit visibility lookup
(`createOctokitVisibilityLookup`, token from `GITHUB_TOKEN` / `GH_TOKEN`). A
private repo SHALL be refused with the ROLES-CHAT-8 private-repo error, and a
repo whose visibility cannot be confirmed (not found, an API error, or no
token) SHALL be refused as unconfirmed (fail closed); in both cases the plugin
SHALL make no further GitHub call for that repo. ADMIN and non-role sessions
keep the GITHUB-6 allowlist gate. No env var, flag, config key or command is
added.
In a scheduled run and its `delegate` / `council` workers (`isScheduleRunEnv`,
REQ-plugins-496) a repo off the GITHUB-6 allowlist SHALL be refused before any
visibility lookup, even when it is public (DISCORD-SCHEDULE-3.a); only an
allowlisted repo then takes the confirmed-public path above.

Acceptance Criteria
- A community session with no injected lookup and GitHub answering `private: true` for the repo is refused with "private GitHub repos" by `checkRepoGateForActingRole` and by `github-pr-list` (exit 3), and no pulls request is sent.
- GitHub answering 404, or no GitHub token (no request sent), is refused with "could not confirm the repo is public".
- GitHub answering `private: false` passes the gate and `github-pr-list` sends its pulls request.
- Fixture tests stub `fetch` (Octokit's transport); no live token or network. The private-repo test fails when the lookup always answers public.
- In a scheduled run a public repo off the allowlist is refused and no visibility request is sent; a community chat (`sess_*`) keeps the public path (`tests/github.schedule-repo-gate.test.ts`).

### REQUIREMENT REQ-plugins-111

The plugin host SHALL provide a typed `web-fetch` builtin (PLUGIN-1) declared
`dangerous: true` and `minTier: 1` (PLUGIN-2) that performs one HTTP GET and
returns text. Being dangerous it SHALL need SAFE-1 consent: it is left out of
the default tool catalog, denied in non-interactive runs unless allowlisted,
and audited (SAFE-5). It SHALL accept only `http` and `https` URLs without
embedded credentials, and SHALL refuse, before DNS, any URL (first hop or
redirect target) that carries a value `scrubSecrets` would redact, raw or
percent-decoded. Before any connection it SHALL check every address the fetch
would use (the IP literal, or every DNS answer) and SHALL refuse (SAFE-7)
loopback, private (RFC 1918), CGNAT (100.64.0.0/10), link-local
(169.254.0.0/16 including 169.254.169.254, fe80::/10), unique-local
(fc00::/7), multicast, unspecified, 0.0.0.0/8, reserved/documentation space
and IPv4-mapped, IPv4-compatible and NAT64 forms of those; one non-public
answer SHALL refuse the name. The connection SHALL dial only checked IPs, in
answer order, moving to the next checked address only after a socket-level
connect failure and within the same deadline, while the Host header and TLS
SNI keep the original name and the certificate is verified against it, so DNS
rebinding cannot swap the target. Redirects SHALL be followed manually (at most
5) with the full check on every hop. The body SHALL be capped at 1 MiB, the
returned text at 100,000 characters (truncated and flagged) and the whole call
at 15 seconds. Non-text content types, a Content-Type that is not an RFC 6838
`type/subtype` token, and compressed bodies SHALL be refused. Returned text
SHALL have C0/C1 control characters removed (newline and tab kept), SHALL be
secret-scrubbed (SAFE-6 `scrubSecrets`) and SHALL be fenced as untrusted data
with a per-call random marker id; the page title SHALL appear only inside the
fence. Errors SHALL NOT echo server-chosen text (reason phrase or header
values) and SHALL be single-line, control-free and length-capped.
In a scheduled run (`isScheduleRunEnv`, REQ-plugins-496) the per-hop check
SHALL also refuse, before DNS, a hop to a GitHub host (`github.com`,
`*.github.com`, `githubusercontent.com`, `*.githubusercontent.com`) that does
not name a GITHUB-6-allowlisted `OWNER/REPO` (DISCORD-SCHEDULE-3.a); the
handler SHALL pass the run's env (`deps.env`, default `process.env`) to
`webFetch`.

Acceptance Criteria
- `plugins list` shows `web-fetch` with dangerous=true, minTier=1; the default tool catalog leaves it out, it is offered at tool/code tier only when dangerous tools are included and never at read tier; a non-interactive run that has not allowlisted it is denied (SAFE-1); no `web-search` command exists.
- Each blocked range, as an IP literal, a DNS answer or a redirect target, is refused with exit 2 before the transport is called.
- A URL or redirect Location carrying a vendor-key-shaped value is refused with exit 2 before DNS and before the transport is called.
- A name that resolves public then private (rebinding) is dialed only at the checked public IP; the private answer on a later hop is refused.
- When a checked address fails to connect, the next checked address is tried; an unchecked address is never dialed.
- Non-http schemes, URL credentials and more than 5 redirects are refused.
- A body over 1 MiB or text over 100,000 characters is truncated and flagged; a stalled transport, body or resolver times out.
- Non-text or malformed content types are refused before the body is read.
- Output is fenced as untrusted data, control characters are stripped and vendor-key-looking secrets are redacted; a hostile title, Content-Type or status text never appears outside the fence.
- HTML-to-text tag stripping repeats to a capped fixpoint, so split or nested tags never reassemble into markup and deeply nested hostile markup stays linear.
- In a scheduled run a direct URL or a redirect into `raw.githubusercontent.com` for a repo off the allowlist is refused on that hop; outside one it is fetched (`tests/github.schedule-repo-gate.test.ts`).
