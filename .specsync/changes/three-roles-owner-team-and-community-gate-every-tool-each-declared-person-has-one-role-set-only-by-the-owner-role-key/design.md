---
change: three-roles-owner-team-and-community-gate-every-tool-each-declared-person-has-one-role-set-only-by-the-owner-role-key
artifact: design
---

# Design

- **Store (IDENTITY-8).** A `role` key in each `[people.<id>]` entry of the
  allowlist file #36 already reads (JSON `role`); no new file, env var, table
  or schema bump. One string, one of owner / team / community; a list or an
  unknown value makes the entry unreadable (skipped whole, like any bad value,
  so it never reads as a wider role). No key ⇒ community. The owner role
  belongs to the configured owner (`[owner]` / env, IDENTITY-1): the owner's
  person is owner whatever it declares; `role = "owner"` elsewhere is
  community plus a problem line.
- **Resolver (IDENTITY-12).** `resolveActingRole(env)` in
  `src/plugins/roles.ts`, next to the existing ADMIN re-check: owner via
  `resolveActingIsAdmin` (unchanged); else team only when the spawn stamp
  (`CORVIDINHO_ACTING_ROLE`) allows team AND the people list, re-read now,
  declares the acting Discord id team (not muted, not deny-listed); else
  community. The stamp is a per-surface cap that can only lower the role:
  Discord chat, button picks, `/session start` and `/work` stamp the
  speaker's role; schedules (no role passed), WATCH (no actor) and workers
  (`CORVIDINHO_ACTING_*` dropped) are community. Missing stamp ⇒ the ADMIN bit
  alone caps at owner, so every existing caller (and ROLES-CHAT test) behaves
  as before.
- **One rule for runPlugin and the catalog.** `roleAllowsPlugin(role, cmd,
  workTask)`: read tools for all; mutating tools for owner / no role session;
  team only `TEAM_REVIEW_TOOLS` (`github-issue-comment`, `github-pr-review`)
  and, in `/work` (`CORVIDINHO_ACTING_WORK_TASK=1`), `TEAM_WORK_TOOLS`
  (`files-write`, `files-edit`); community none. `runPlugin` keeps the same
  refusal text, so the ROLES-CHAT-3 summary note works for every role.
  `buildOpenAiTools` takes `actingRole` / `workTask` (`actingIsAdmin` kept for
  existing callers); `createTaskExecute` resolves the role per attempt.
- **GitHub (IDENTITY-10).** `checkRepoGateForActingRole(repo, { write })`:
  deny first; team writes need the GITHUB-6 allowlist, team reads pass on it
  or a confirmed-public repo; community writes are refused; owner / CLI keep
  the allowlist. The four GitHub write commands pass `write: true`.
- **/work (IDENTITY-10).** The team member's run gets the work flag, so the
  file tools apply only inside its own worktree (a /work session always has
  one; chat may fall back to the project root, so chat never gets them). The
  handler ships the PR for owner or team, re-resolving the team role from the
  live people list after the run (a demoted member gets no PR); the PR path's
  own gates (allowlist, verify, GITHUB-6) are unchanged.
- **ADMIN-3.b.** `/admin people role` reuses the #36 writer (`op: "role"`,
  plan → SAFE-5 `started` → atomic write → `ok`, re-read safety net, unread
  keys kept).
- **ROLES-CHAT-8.a.** Two read-only readers in `plugins/github/public-docs.ts`
  (docs-only paths, milestones) behind the acting role's repo gate, and the
  public Q&A prompt names exactly those sources. `web-fetch` stays dangerous,
  so it is never a community source; no site URL is configured.

## Design choices pending Leif

Each is the most conservative reading of the captured text; none adds a
criterion.

1. Team's tool grant is exactly `github-issue-comment` + `github-pr-review`
   (reviews) everywhere on Discord, plus `files-write` / `files-edit` only in
   a `/work` run (work tasks); team gets no shell / runners (SAFE-3.a says
   non-owners never), no git or other GitHub writes, no `discord-post-message`
   / `discord-send-file`, no `web-fetch`, no `delegate` / `council`. The `/work`
   PR itself is opened by the handler for team as for the owner.
2. Team GitHub writes only on GITHUB-6-allowlisted repos; team reads on
   allowlisted or confirmed-public repos (never less than community).
3. WATCH (GitHub), schedules and `delegate` / `council` workers stay community
   whoever triggered them, even the owner (today's behaviour); a team
   member's own schedules stay read-only (DISCORD-SCHEDULE-1.a covers owner
   schedules separately).
4. "Only their own memory": team keeps the existing per-user memory scope;
   forget / override (even self-forget) stay owner-only as MEMORY-ACL-3/4
   say. Community keeps `memory-store` / `-recall` for itself, as today
   (ROLES-CHAT-2 lists memory recall as a read tool; it is not marked
   mutating).
5. "Briefings" (#102) do not exist yet; nothing is offered for them.
6. "Announcements" for community = receiving what the owner posts; `/announce
   channel` stays owner-only. Community may still run `/session start` and a
   read-only `/work` (no edit tools, no PR), as today.
7. No `role` key ⇒ community; `role = "owner"` outside the owner's person ⇒
   community with a problem line; a bad role value ⇒ the entry is skipped
   whole (the person is then undeclared, still community).
8. `/admin people role` sets team or community only; the owner role is
   changed only through `[owner]` / env on the VM (IDENTITY-1), and the
   owner's own person cannot be given another role there.
9. Team sessions keep community's secret-path refusals (`.env*`, keys) for
   reads; SAFE-2 still refuses protected paths for their `/work` writes.
10. ROLES-CHAT-8.a "allowed public repos" = public repos that pass the
    community gate (deny lists win, visibility confirmed public), as
    ROLES-CHAT-8 already reads "any public GitHub"; `github-docs-read` is
    docs-only for every role, and community's local project file reads are
    unchanged.
11. Two internal spawn env keys (`CORVIDINHO_ACTING_ROLE`,
    `CORVIDINHO_ACTING_WORK_TASK`) carry the per-surface cap, like
    `CORVIDINHO_ACTING_IS_ADMIN`; they are not operator config and can only
    lower a role.
