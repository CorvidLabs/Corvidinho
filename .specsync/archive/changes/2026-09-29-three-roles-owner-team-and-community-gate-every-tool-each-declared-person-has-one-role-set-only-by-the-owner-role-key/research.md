---
change: three-roles-owner-team-and-community-gate-every-tool-each-declared-person-has-one-role-set-only-by-the-owner-role-key
artifact: research
---

# Research

- Role gate today (`src/plugins/roles.ts`): `roleSessionActive` (the bridge
  always sets `CORVIDINHO_ACTING_IS_ADMIN`), `resolveActingIsAdmin` (bit +
  owner match, not muted, not deny-listed). Callers: `runPlugin`, the tool
  loop (`refusedForRole`, catalog `actingIsAdmin`), `githubPublic.ts`,
  `plugins/files/protectedPaths.ts` (secret paths), `plugins/memory`
  (forget/override). Only the first three need three roles; the last two stay
  owner-vs-rest.
- Spawn sites: bridge chat and button-pick resume, `/session start`, `/work`
  (all `resolvePermissionLevel` ⇒ `actingIsAdmin`), scheduler
  (`actingIsAdmin: false`, actor = creator), WATCH client (bit 0, no actor),
  `buildDelegateSpawn` (drops `CORVIDINHO_ACTING_*`, bit 0), council voices
  (through the delegate core). The schedule path carries the creator's id, so
  the tool layer cannot infer the surface from the actor alone: a per-surface
  stamp is needed, and it must fail closed when absent.
- Chat's cwd falls back to the project root when a talk has no active
  worktree (`SessionStore.cwdFor`); `/work` always binds one (or a scoped dir
  for non-git projects) before it runs.
- `/work` PR step (`src/work/pr.ts`) runs `git-commit` / `git-push` /
  `github-pr-create` through `runPlugin` in the bridge process (no role
  session), gated by the handler's owner check today.
- GitHub write commands share `requireRepo` → `checkRepoGateForActingRole`;
  reads use it too (`review.ts` its own `gateRepo`).
- No GitHub milestone or repo-contents reader exists; Octokit
  `issues.listMilestones`, `repos.getReadme`, `repos.getContent` (the path's
  `/` is sent as `%2F`).
- corvid-agent steal notes (#65): per-command role floor re-checked at handler
  time and hiding tools a session may not use (not refusing after) — both kept
  (catalog + `runPlugin`); namespace:verb grants reduced to two small named
  sets.
