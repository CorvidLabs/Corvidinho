---
module: watch
change: on-github-the-owner-and-team-i-ve-declared-get-their-role-s-tools-behind-the-must-ask-gate-strangers-stay-community
---

# Delta: watch (on GitHub the trigger's declared role reaches the tool layer — IDENTITY-12.a)

## Modified

### REQUIREMENT REQ-watch-008

The WATCH agent spawn SHALL clear `CORVIDINHO_ACTING_DISCORD_USER_ID` and
`CORVIDINHO_ACTING_CONFIRM_TOKENS`, set `CORVIDINHO_ACTING_IS_ADMIN` from the
role of the person who triggered the run (REQ-watch-1201: `1` only for the
owner, else `0`), and run
non-interactive (`CORVIDINHO_NON_INTERACTIVE=1`, SAFE-1). GitHub-originated runs have no Discord acting
user and SHALL NOT inherit a Discord identity or an ADMIN bit from the
watcher's environment.
Since #67 (MEMORY-8, Leif's 2026-09-28 interview) memory is no longer refused
in them: the spawn SHALL instead pass the commenter's GitHub login, numeric id
and the thread's repo (`CORVIDINHO_ACTING_GITHUB_LOGIN` / `_ID` / `_REPO`,
REQ-watch-067) and SHALL clear the Discord reply channel keys
(`CORVIDINHO_DISCORD_REPLY_CHANNEL_ID` / `_PARENT_CHANNEL_ID`), so the memory
plugins act for the commenter's declared person with MEMORY-7 privacy and give
an undeclared commenter community scope (REQ-plugins-067).

- Since IDENTITY-12.a (#65, Leif's 2026-09-28 interview, round 16) the ADMIN
  bit is no longer always `0`: the spawn SHALL stamp the role the poller
  resolved for the run's trigger (REQ-watch-1201) — `CORVIDINHO_ACTING_IS_ADMIN=1`
  and `CORVIDINHO_ACTING_ROLE=owner` for the owner, `0` / `team` for a
  declared team member, `0` / `community` for anyone else or when no role is
  given — and `CORVIDINHO_ACTING_WORK_TASK=0`, every one always overwritten.
  The memory plugins still never give a GitHub run the owner's `--person`
  view, private notes or profile reads (they need a Discord actor and a
  private reply place), and project memory stays read-only there.

Acceptance Criteria
- WATCH spawn env has an empty acting user, no confirm tokens and `CORVIDINHO_NON_INTERACTIVE=1` even when the parent env sets them; `CORVIDINHO_ACTING_IS_ADMIN` is `0` (and `CORVIDINHO_ACTING_ROLE` `community`) when no role, or community, is given, even when the parent env sets `1` / `owner`.
- WATCH spawn env carries the commenter's `CORVIDINHO_ACTING_GITHUB_LOGIN` / `_ID` and the thread's `CORVIDINHO_ACTING_GITHUB_REPO` over any inherited value, and empty Discord reply channel keys.
- In a GitHub-shaped env a declared commenter's `memory-store` / `memory-recall` succeed on their own profile; an undeclared commenter's personal store and recall are refused.
- With `actingRole: "owner"` the child sees `CORVIDINHO_ACTING_IS_ADMIN=1`, `CORVIDINHO_ACTING_ROLE=owner`, `CORVIDINHO_ACTING_WORK_TASK=0`; with `"team"` `0` / `team` / `0` (`tests/watch.github-roles.test.ts`).

## Added

### REQUIREMENT REQ-watch-1201

IDENTITY-12.a (#65, captured from Leif's 2026-09-28 interview, round 16):
"On GitHub, the owner and team members I've declared get their role's tools
too, behind the same must-ask gate; anyone else stays community." The WATCH
poller SHALL pass each run the declared role of the person who **triggered**
it, `watchTriggerRole(event, people)` (`src/watch/router.ts`), as
`AgentRunChatOpts.actingRole`:

- An `issue_comment`, `issues` (a body mention) or
  `pull_request_review_comment` event is triggered by its sender: the role is
  `roleOfPerson(resolvePerson(people, { githubId: senderId }))` in the
  owner's people list re-read for the event (IDENTITY-13/14) — the GitHub
  numeric user id the API reported, never the login and never a name
  (IDENTITY-7 / 7.a). No id, an undeclared id, a declared community person, or
  no people list ⇒ `community`.
- An `assignment` or `review_request` is triggered by its `actor` (who
  assigned or requested), whom the event names by login only, never by the
  thread author: it SHALL be `community`, whoever the author is.
- The spawn SHALL stamp that role (REQ-watch-008); the tool layer re-resolves
  it from the GitHub id at every call (REQ-plugins-1201), so the stamp only
  caps it.
- The identity block (`formatWatchIdentityBlock`) SHALL give a declared
  owner or team sender a role line: `- role: <owner|team> (this run has the
  <role>'s tools, behind the same must-ask gate as on Discord)` when the
  sender triggered the run, else `- role: <owner|team> (but this run was
  started by an assignment or review request, so it has community tools)`.
- Unchanged: the repo and user allowlist gate before any run (ALLOW-1/2,
  REQ-watch-302), the SAFE-12 fence on the thread's title and body for every
  role, the SAFE-13 owner exemption, the `watch` surface (no shell, runners
  or Fledge runs, SAFE-3.a, REQ-watch-735), the memory scope (REQ-watch-067).
  No env var, config key, flag, table or schema change.

Acceptance Criteria
- Through `startWatchPoller`: comments by the owner's numeric id → `actingRole: "owner"` and the prompt's owner role line; by the team member's → `"team"`; by a declared community person, a stranger, the owner's login with another id and with no id → `"community"`, with no owner or team role line; the thread text is still fenced.
- An issue-body mention by the team member → `"team"`; an assignment and a review request on the owner's own thread → `"community"`, and the prompt says the run has community tools.
- `watchTriggerRole` gives owner / team by numeric id, community for a community person, a stranger, a re-registered login, no id, no people list and both actor-gated types.
- `tests/watch.github-roles.test.ts` fails on the base sources and passes on the branch.
