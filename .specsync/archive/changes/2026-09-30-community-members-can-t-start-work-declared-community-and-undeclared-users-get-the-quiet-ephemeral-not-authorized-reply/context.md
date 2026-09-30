---
change: community-members-can-t-start-work-declared-community-and-undeclared-users-get-the-quiet-ephemeral-not-authorized-reply
artifact: context
---

# Context

Issue #65 (M1 "Knows everyone"), roles. Leif's decision in round 12 of the
2026-09-28 interview record (2026-09-29): community gets Q&A and
announcements only; `/work` from community gets the normal quiet not-allowed
reply; team and owner keep `/work`. Captured in this change's PR with `hi`
(first commit) into `hi/identity.md`:

- **IDENTITY-11.a** "Community members can't start /work." (under the
  already captured **IDENTITY-11** "Community members get Q&A and
  announcements only, with no mutating tools.")

Related captured criteria that still hold: IDENTITY-3 (empty owner means
nobody is admin), IDENTITY-10 (team gets work tasks), IDENTITY-12 (role
checked in the tool layer; undeclared is community at most), ROLES-CHAT-2/3,
DISCORD-DENY-1..3 / DISCORD-5 (quiet refusals, never a public "not
authorized"), SAFE-13 (a suspected injection is refused and the owner told).

Gap on the base (main 20a0f58): the #285 roles change (REQ-discord-065,
design choice 6) let community run a read-only `/work`: a community caller
got a deferred public reply, a session, a git worktree and `talk/*` branch,
a work task and an agent run with the verify lane, only without edit tools
and without the PR step (REQ-discord-088 "community /work runs keep the
changes on the work branch"). `docs/discord.md` and
`docs/DISCORD-GO-LIVE.md` said so.

Constraints: reuse the #285 resolver (`resolveDiscordActingRole` over the
owner config and `loadDeclaredPeople`, re-read per command) and the existing
`NOT_AUTHORIZED` ephemeral refusal; no new env var, config key, slash
command, option or schema. #232 / #233 are landed separately and are out of
scope. Specs change only through this SpecSync change. v1 is off-chain.
