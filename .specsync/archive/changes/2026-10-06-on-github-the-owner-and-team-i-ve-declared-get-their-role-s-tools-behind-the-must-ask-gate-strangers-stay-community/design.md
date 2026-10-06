---
change: on-github-the-owner-and-team-i-ve-declared-get-their-role-s-tools-behind-the-must-ask-gate-strangers-stay-community
artifact: design
---

# Design

- **One role resolver, two id sources.** `resolveActingIsAdmin` /
  `resolveActingRole` keep their contract (re-resolved at every call, the
  stamp only lowers, fail closed). A WATCH run (`isWatchRunEnv`: the surface
  stamp `watch`, which both spawn clients always overwrite) takes a GitHub
  branch that reads `CORVIDINHO_ACTING_GITHUB_ID` and resolves it with the
  same `loadDeclaredPeople` + `resolvePerson` + `roleOfPerson` the Discord
  path and the WATCH router use; a non-WATCH run never reads the GitHub
  keys, and a WATCH run never reads a Discord id. Keying the branch on the
  surface stamp (not `CORVIDINHO_WATCH_SESSION_ID`, which the Discord client
  does not clear) means a stray watch session id in a bridge env cannot
  demote Discord runs; raising on GitHub additionally needs the WATCH session
  id.
- **The trigger, not the thread.** `watchTriggerRole` in the router is the
  one place that decides whose role a run gets: the sender for comment and
  body-mention events; community for assignment / review_request, whose
  trigger (`actor`) is known by login only. The poller passes it as
  `actingRole`; the spawn stamps it like the Discord client does
  (`IS_ADMIN`, `ROLE`, `WORK_TASK=0`). The memory keys
  (`CORVIDINHO_ACTING_GITHUB_*`) are unchanged (MEMORY-8), and because the
  community stamp short-circuits the tool layer, the thread author's id on an
  assignment never lifts the role.
- **Project code stays off GitHub.** Before this change no WATCH run was
  ADMIN, so `createTaskExecute` never discovered Fledge plugin commands for
  one. An owner-triggered WATCH run is ADMIN now; like the owner's own
  schedule (REQ-agent-741) it SHALL NOT discover them (they run arbitrary
  project code, which SAFE-3.a keeps off WATCH with the shell and runners).
- **Same must-ask gate.** No new card path: `runPlugin`'s gate already writes
  the card to the shared approvals store, which the running bridge DMs to the
  owner (`mustAskApprovalKinds`); the card title already names the surface
  (`from watch:<session>`). The owner's WATCH run simply reaches it now.
- **Conservative choices where the text leaves room** (listed for Leif):
  secret-looking paths stay hidden on GitHub for every role (public thread);
  team's work tasks stay `/work`-only (WATCH runs in the watcher's checkout,
  not a worktree); assignments / review requests stay community; delegate /
  council workers stay community; the owner's own comment stays inside the
  SAFE-12 fence.
- **Risks.** The owner's WATCH run now has write tools in the watcher's
  checkout (`--here`, REQ-cli-122) — files, git, GitHub writes — behind
  SAFE-1 / SAFE-2 / the must-ask gate; the audit actor of a WATCH call is
  still `local` (SAFE-5 rows name the `watch:<session>` surface).
