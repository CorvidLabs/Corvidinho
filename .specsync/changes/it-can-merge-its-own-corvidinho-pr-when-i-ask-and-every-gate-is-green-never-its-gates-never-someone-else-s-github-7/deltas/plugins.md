---
module: plugins
change: it-can-merge-its-own-corvidinho-pr-when-i-ask-and-every-gate-is-green-never-its-gates-never-someone-else-s-github-7
---

# Delta: plugins (github-pr-merge — it merges its own Corvidinho PR when I ask, GITHUB-7 / GITHUB-7.a)

## Added

### REQUIREMENT REQ-plugins-099

It may merge its own Corvidinho PR when verify and CI are green and branch
protection, reviews and CODEOWNERS allow it; it never bypasses them, never
merges someone else's PR, and outside Corvidinho a human still merges
(GITHUB-7, captured on main from Leif's 2026-09-28 interview, round 4). It
merges only PRs it opened from its own talk branches with its own token, and
only when I ask; it never marks its own /work draft ready, won't merge a PR
that changes its own gates (.github, fledge.toml, hi/, AGENTS.md, CODEOWNERS),
and counts CI green only when smoke and spec-sync pass at the head
(GITHUB-7.a, captured with `hi` in this change from the same interview
record, round 16 of 2026-10-06).

The GitHub plugin SHALL register `github-pr-merge`
(`plugins/github/merge.ts`, `makeGithubPrMergeCommand(deps)`; dangerous,
mutating, minTier 1), taking `<number> --repo OWNER/REPO --sha <40-hex head
sha>` and nothing else (no draft-ready, admin or bypass option; a usage error
is exit 1). `checkSelfMerge(args, env, deps)` SHALL be its gate, re-read in
full on every call, never throwing (a GitHub error refuses, exit 1), and SHALL
refuse with exit 2, `refused (GITHUB-7.a): <why>`, `data.reason` and
`auditDenied` set to the reason code unless every one holds, in this order:
- the caller is the owner's own interactive run (`selfMergeCallerRefusal`):
  not a delegate or council worker (`worker`), not WATCH — a WATCH session
  id or the `watch` surface stamp, the owner's own GitHub-triggered run
  included although IDENTITY-12.a gives it the owner's other tools
  (`watch`) — not a scheduled run, the owner's own included (`schedule`); with no role session
  the local CLI nothing spawned (no Discord session id, no surface stamp, no
  `CORVIDINHO_PROJECT_ROOT`; else `spawned`); in a role session the surface
  stamp is `chat`, `ask`, `session` or `work` (else `surface`) and the role,
  re-resolved now (IDENTITY-12), is the owner (else `not-owner`);
- `--repo` is `CorvidLabs/Corvidinho` (`SELF_MERGE_REPO`, no case) — else
  `not-corvidinho`, saying outside Corvidinho a human still merges — and
  passes the GITHUB-6 gate for a write (`repo-gate`); a client exists
  (`no-token`) and the token's own user can be read (`token-unknown`);
- the PR is open and not merged (`not-open`), its base repo is Corvidinho
  (`not-corvidinho`), its author id is the token's user id
  (`foreign-author`), its head repo is the base repo and its head ref is a
  Corvidinho talk branch (`TALK_BRANCH_RE`,
  `talk/<1-16 of [A-Za-z0-9_-]>-<16 hex>`, as `generateTalkBranchName` names
  it; else `not-own-branch`), it is not a draft (`draft`), its head sha is the
  `--sha` named (`head-moved`), no `ready_for_review` event on it was by
  the token's user (`self-marked-ready`), and at least one was by a person —
  not the token's user and not an app (actor type `Bot` or a `…[bot]` login)
  — so a PR it opened ready, or one only an app marked ready, waits until a
  human marks it ready (`not-marked-ready`; an event list not read whole is
  `events-truncated`);
- no changed path or a rename's old path is a gate (`selfMergeGatePath`:
  `.github/`, `hi/`, any `fledge.toml`, a `.fledge` folder, any `AGENTS.md`,
  any `CODEOWNERS`, any `.trust.toml`, any `bunfig.toml`, `.specsync/`
  outside `changes/` and `archive/`, and `SELF_MERGE_CODE`:
  `plugins/github/merge.ts`, `plugins/github/ciStatus.ts`,
  `src/plugins/githubPublic.ts`, `src/plugins/must-ask.ts`,
  `src/plugins/run.ts`, `src/plugins/roles.ts`, `src/agent/shell-gate.ts`,
  `src/approvals/code.ts`, `src/approvals/store.ts`,
  `src/discord/approval-cards.ts`; names without case; else `gate-path`), and the file list was read whole
  (fewer than `changed_files` or 30 full pages is `files-truncated`);
- no reviewer's latest APPROVED / CHANGES_REQUESTED / DISMISSED review is
  CHANGES_REQUESTED (`changes-requested`; a list not read whole is
  `reviews-truncated`);
- for each of `smoke` and `spec-sync` (`SELF_MERGE_CHECKS`, the jobs in
  `ci.yml` and `spec-sync.yml`) the check runs at exactly the head sha from
  the `github-actions` app exist (`ci-<check>-missing`), are all completed
  (`ci-<check>-pending`) and all `success` (`ci-<check>-failed`), and the
  whole CI verdict at that sha (`fetchCiStatus`) is green with no warning
  (`ci-red`, `ci-pending`, `ci-none`, `ci-unread`);
- GitHub reports `mergeable: true` and `mergeable_state` `clean` or
  `has_hooks` (`not-mergeable`), so branch protection, reviews and CODEOWNERS
  allow it now and the merge never leans on an admin bypass.

Its must-ask classifier SHALL run that gate and return `refuse` with its
result (no card) or, when it passes, ask class `merge` (REQ-plugins-097) with
the target `<repo>#<n> at <head sha>` and the squash title as text; a dry run
(`CORVIDINHO_GITHUB_DRY_RUN=1`) asks nothing. After the owner's approval the
handler SHALL run the whole gate again and only then call `pulls.merge` once
with `sha` = the named head, `merge_method: "squash"` and `commit_title`
`<PR title> (#<n>)` (`selfMergeCommitTitle`), never an admin or bypass
option; its result SHALL name the merge sha (`Merged PR #<n> "<title>" into
<base> as <sha> (squash, GITHUB-7.a).`, `data.sha`). GitHub not merging, or
answering 405 / 409 / 422, SHALL be a `github-refused` refusal saying nothing
was merged; a dry run SHALL merge nothing and return what it would do. Every
attempt SHALL leave SAFE-5 rows (REQ-plugins-095): one `denied` row named
`github-pr-merge:<reason>` for a refusal from the gate or the card (no
`started`), or `started` then `ok`, `error` or `github-pr-merge:<reason>`
`denied` for the handler. Team and community calls stop at the role gate
before the tool (REQ-plugins-065); the owner's own WATCH run passes that
gate (IDENTITY-12.a, REQ-plugins-1201) and is refused by the caller check
with a `github-pr-merge:watch` row. No env var, config key or schema change.

Acceptance Criteria
- With a fake GitHub client, a green PR and an approved card, `runPlugin` merges once with the named head sha, `squash` and `<title> (#12)`, names the merge sha, and leaves `started` then `ok`; the card is kind `mustask-merge`, class destructive, with target `CorvidLabs/Corvidinho#12 at <sha>`.
- On the bridge's real card engine Approve alone merges nothing; Approve plus the one-time code merges once.
- Each refusal — draft, foreign author, non-talk branch, fork head, closed, head moved, self-marked ready, opened ready with no person marking it ready, marked ready only by an app, a gate path (and a rename away from one), a short file list, changes requested, smoke or spec-sync missing, failed, pending, at another commit or from another app, another check failing, blocked, unknown or conflicting mergeability, an unreadable token user — raises no card, merges nothing and leaves one `github-pr-merge:<reason>` `denied` row.
- A non-Corvidinho repo and a bad usage are refused before any GitHub call; WATCH (a WATCH session id, a `watch` stamp, and the owner's own GitHub-triggered run as the WATCH spawn stamps it), a schedule (the owner's own), a worker, a missing surface stamp, a muted owner, team and a spawned local run are refused before any GitHub call; the owner's chat, `/session start`, `/work`, ask answers and the local CLI pass.
- Through `runPlugin`, the owner's own GitHub-triggered WATCH run passes the role gate but is refused with no card, no GitHub call and one `github-pr-merge:watch` `denied` row.
- `.trust.toml` in any folder (any case) and every `SELF_MERGE_CODE` file are gate paths; `trust.toml` and `docs/trust.md` are not.
- A PR turned back into a draft while the card waits is refused after the approval (`started`, then `github-pr-merge:draft`), and a denied card leaves `github-pr-merge:card-denied`.
- `tests/github.self-merge.test.ts` fails on the base sources and passes after.

## Modified

### REQUIREMENT REQ-plugins-097

It asks me before touching prod or deploys (VPS, secrets, env, DNS); updating
itself to a tagged release is not a deploy (AUTONOMY-9). Any contact with prod
asks me first, read-only looks included, and every prod card needs the
one-time code (AUTONOMY-9.a). It asks before announcements it starts
(AUTONOMY-10); every channel post it makes waits for my OK, even text I
dictated and replies to me (AUTONOMY-10.a, channel-post half). Anything else
inside its guardrails, it just does and tells me (AUTONOMY-11). AUTONOMY-9,
-10 and -11 were captured on main from Leif's 2026-09-28 interview; 9.a and
10.a are captured with `hi` in this change from his 2026-09-30 round 13
decisions. The first-20 public-thread replies half of AUTONOMY-10 / 10.a is a
later change.

`runPlugin` SHALL call `mustAskGate` (`src/plugins/must-ask.ts`) for every
caller, after the ROLES-CHAT role gate and the SAFE-1 deny and before the
SAFE-5 `started` row. A call's class SHALL come only from its command's
`PluginCommand.mustAsk` (a `prod` | `public` | `merge` class, or a classifier over
its args and the files and config they name); nothing the model or a message
says changes it, and a classifier that throws SHALL ask as prod. A `refuse`
verdict (the command would refuse the call anyway) SHALL be returned with no
card. For an `ask` verdict:
- a delegate or council worker (`CORVIDINHO_DELEGATE_DEPTH` > 0) SHALL be
  refused with no card; with no owner configured the call SHALL be refused at
  once (nothing could approve it);
- the same call the owner denied (same card kind and action hash — tool,
  args and target — and the same requester) SHALL be refused with no new
  card (SAFE-20); a changed call asks again and a lapse does not block;
- otherwise one `approval_requests` row SHALL be recorded: kind `mustask`,
  class destructive (Approve plus the SAFE-19 one-time code) for prod, kind
  `mustask-post`, class plain for a channel post, kind `mustask-merge`, class
  destructive for a merge of its own PR (GITHUB-7.a, REQ-plugins-099); action
  `<tool>: <why>`, the target, the amount (`1 call (no money)` /
  `1 message (N characters)` / `1 merge (no money)`),
  the exact text or command as its text, the acting user (or `local`) as
  requester, this process as waiter, `MUST_ASK_CARD_TTL_MS` (5 min) to
  answer; the run SHALL note the wait once (`setMustAskNotifier`, stderr by
  default) and wait with its abort signal;
- only an approval it consumes (`approved` → `used`) SHALL run the call; a
  deny, no answer by the expiry or a stopped run (exit 130) SHALL run nothing
  and return a refusal naming the rule, the request id and why (with no
  bridge the lapse says the bridge DMs the card); a run stopped just as the
  owner approves SHALL run nothing (the approval is left unused); every gate
  refusal SHALL append a SAFE-5 `denied` row, and the gate's notes and
  refusals SHALL be secret-scrubbed (SAFE-6).

Classes: `discord-post-message` is public for every post (the card's text is
the defanged text that would be posted; a dry run posts nothing and asks
nothing; its channel, requester-flag, token and strict checks run first and
refuse with no card). Prod: `shell-exec` when `shellProdWhy` names a reason —
over the SAFE-3 clamp's walker and every command an exec wrapper runs: the
`PROD_COMMANDS` table (ssh family; root; the box's services, packages,
containers, firewall and cron; secrets tools; cloud, hosting, cluster and
infrastructure CLIs; DNS tools), remote `rsync`, `gh` on secrets,
variables, workflows, releases (and `gh api` on those paths), `git push`
(git and gh subcommands read past global options and their values; a git
alias read from the repo's config like what it stands for, one set with
`-c alias.…` asks), `npx`-style runs of one (`bun x` included, `-c` shell
text read), package scripts (with pre/post) from package.json (`bun
<script>` included; `bun <file>` and `bun exec` text read; an install reads
the install lifecycle scripts), `make` / `just` recipes with prerequisites
and variables, inline interpreter code and in-root or `#!` scripts an
interpreter or path runs; an unreadable script or recipe, a make / just file
or dir option, a package-manager option that picks another package.json,
workspace, preload or shell, and a command named by an expansion ask; a
command SAFE-21 or the clamp refuses is left to the handler. Free text
(runner code, recipe and task text) also names SSH, cloud and secrets client
libraries (`paramiko`, `ssh2`, `awscli`, `hvac` …). Exactly
`CORVIDINHO_REF=v<X.Y.Z>` plus the installed checkout's
`scripts/corvidinho-update.sh` (or `bash` it), nothing else, for
a tag that checkout has, SHALL NOT ask (`isSelfUpdateToTag`); the updater in
any other form asks. The language runners ask on table words in argv and an
in-root script they run; `fledge-run` / `fledge-lanes-run` read the task and
lane commands from `fledge.toml` / `.fledge/lanes/*.toml` and ask for any
that do or can't be read (no fledge.toml: no ask, fledge refuses); a
discovered `fledge-<command>` asks on table words in its name or argv;
`git-push` asks for the remote's recorded default branch and for a usual
default or deploy name (`main`, `master`, `production`, `gh-pages` …)
whatever default is recorded. `github-pr-merge` SHALL be class `merge`
through its classifier, which runs the whole self-merge gate first and raises
no card for a merge it would refuse (GITHUB-7.a, REQ-plugins-099). Every other
builtin SHALL have no class and run with no ask. No env var, config key or schema change.

Acceptance Criteria
- An approved card runs the call once after it and the request ends `used`; prod is kind `mustask` class destructive, a post kind `mustask-post` class plain with the exact text.
- A deny runs nothing and says so; the same call again is refused with no new card; a changed call asks again.
- No answer by the expiry runs nothing (`expired`), says the bridge DMs the card, and a re-send asks again.
- A delegate worker and a run with no owner are refused with no card; an aborted wait is exit 130; a throwing classifier asks as prod; each refusal is a SAFE-5 `denied` row.
- `discord-post-message` text claiming it needs no OK still raises the card; a dry run and a refused post raise none.
- The shell, runner, Fledge and git-push classifiers ask for the table commands and forms above, read-only looks included, and not for everyday commands; the tagged self-update runs with no ask and every near-miss form asks.
- `git -C . push`, `gh workflow -R o/r run`, a git alias for a push, `bun <script>` / `bun x` / `bun exec` / `bun <file>` of a prod command, `npx -c`, a prod install script and a package-manager option that picks another package.json ask; `main` pushed while `develop` is the recorded default asks.
- A run stopped just as the owner approves runs nothing; the wait line and refusals carry no secret.
- Only the must-ask builtins carry a class; every other builtin passes the gate with no card.
- `github-pr-merge` carries the `merge` class: a merge whose gate passes raises one card of kind `mustask-merge`, class destructive (Approve plus the one-time code), titled `Merge its own PR — only when you ask (GITHUB-7.a) · from <surface>`, amount `1 merge (no money)`, target `<repo>#<n> at <head sha>` and the squash title as its text; a deny, lapse or other card refusal of it is one `denied` row named `github-pr-merge:card-<outcome>` (REQ-plugins-099).

### REQUIREMENT REQ-plugins-095

Every run of a plugin command marked dangerous SHALL leave a tamper-evident
audit trail (SAFE-5): `runPlugin` SHALL append a `started` row to the shared
append-only `audit_log` before the handler runs and SHALL refuse the run if
that row cannot be written (fail closed), then append an `ok` or `error` row.
A dangerous run denied in non-interactive mode SHALL be logged as `denied`
(best effort). A refusal that names its reason as a fixed kebab-case code
(`PluginHandlerResult.auditDenied`, `[a-z0-9-]{1,48}`, never args or text)
SHALL instead be logged as one `denied` row whose action is
`<command>:<reason>`: from the must-ask gate (its classifier or its card; no
`started` row) or from the handler (after `started`, in place of `error`)
(GITHUB-7.a, REQ-plugins-099). Rows SHALL hold the action, actor, surface, a SHA-256 digest of
the argv, the outcome and exit code — never raw args or memory content.

The chain SHALL be HMAC-SHA256 keyed by `CORVIDINHO_AUDIT_HMAC_KEY` from the
bot-VM environment (never stored in the DB); without a key it is a SHA-256
integrity chain reported as unkeyed. `verifyAudit` SHALL recompute the chain
and report the first tampered row; keyed rows are unverifiable without the key.
Once the chain holds a keyed row it SHALL stay keyed: `appendAudit` without a
key SHALL refuse to append after a keyed row, and `verifyAudit` SHALL report
an unkeyed row that follows a keyed row as the first tampered row, so a keyed
row cannot be rewritten and relinked as a plain SHA-256 link while a keyed row
before it stays. An unkeyed prefix followed by keyed rows (key set later)
SHALL still verify. Rewriting every keyed row, from the first keyed row on, as
unkeyed links, or dropping the newest rows, is not detectable from the DB
alone; catching it needs an anchor kept outside the DB.

The one-line chain summary (`formatAuditLine`: the bridge start log and
`/status`, REQ-discord-095) SHALL read `chain BROKEN at #N` for every break
`verifyAudit` reports at a row it could check: with the key, and also without
the key when the first tampered row comes before any keyed row (a tampered
unkeyed chain, or a tampered unkeyed prefix), since a SHA-256 link needs no key
to check. Only a verify that stops at a keyed row because no key is set SHALL
read `cannot verify keyed rows (CORVIDINHO_AUDIT_HMAC_KEY not set)`.

Acceptance Criteria
- Allowed dangerous run appends started + ok rows; raw args are not stored.
- Non-interactive denial appends a denied row; safe plugins append nothing.
- A dangerous run is refused when its started row cannot be written.
- Tampering is detected at the first bad row; wrong/missing key fails verify.
- A keyed row that follows a keyed row, edited and relinked with the rows after it as unkeyed SHA-256 links, fails verify with the key at that row (`chain BROKEN at #N`).
- Without the key, appending after a keyed row is refused, so a keyless dangerous run fails closed and the chain stays keyed; an unkeyed prefix followed by keyed rows still verifies (`mixed keyed/unkeyed`).
- Without `CORVIDINHO_AUDIT_HMAC_KEY`, a tampered unkeyed chain (no keyed rows) reads `Audit: N entries · chain BROKEN at #n` at the first tampered row, the same line as with a key, and so does a tampered unkeyed prefix before keyed rows; an intact unkeyed prefix before keyed rows, or a keyed chain, read without the key still reads `cannot verify keyed rows (CORVIDINHO_AUDIT_HMAC_KEY not set)`.
- An edit to any one stored column of a keyed row made behind a dropped update trigger — `ts`, `action`, `actor`, `surface`, `args_digest`, `outcome`, `exit_code`, `keyed`, `prev_hash` or `hash` — fails verify with the key at that row (`chain BROKEN at #N`).
- A dangerous run whose handler returns `ok: false` appends `started` (no exit code) then `error` with the handler's exit code; a dangerous run whose handler throws appends `started` then `error` with exit code 1, and the throw still reaches the caller.
- A dangerous run whose handler or must-ask classifier refuses with `auditDenied: "<reason>"` appends one `denied` row under `<command>:<reason>` (after `started` for the handler) instead of `error`; a result without it is unchanged (`tests/github.self-merge.test.ts`).
