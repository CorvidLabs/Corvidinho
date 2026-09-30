---
change: private-notes-profile-reads-and-the-owner-s-view-of-someone-s-memory-are-shown-only-privately-in-a-discord-conversation
artifact: context
---

# Context

Issue #101 (MEMORY profiles, private notes, forget on request; milestone M1
"Knows everyone"). #101's first slice shipped profiles, project memory,
MEMORY-7 privacy and forget-me (REQ-plugins-101 / REQ-discord-101); #67
(REQ-*-067) added memory in GitHub runs. The #291 rollup found the gap this
change closes: "who can read is enforced, where it is shown is not" — the
owner's `--person` view, private notes and profile reads were returned to
the model, and only a prompt rule stopped it repeating them in a shared
channel.

Leif confirmed the criterion in the 2026-09-28 interview, round 12 (on
2026-09-29), "private things only privately": private notes, the owner's
--person view and profile reads go only to that person or the owner privately
(an ephemeral reply or a DM), never in a shared channel post; the channel gets
a short "sent privately" note. Captured with `hi` in this PR's first commit:

- **MEMORY-7.a** "Private notes, profile reads and my view of someone's
  memory are shown only privately to that person or me, never in a shared
  channel." (parent **MEMORY-7**, already captured.)

Gap on main (20a0f58): `memory-recall --category private`,
`memory-recall --person` and `memory-profile` return their rows / text as
the tool result the model reads; the answer, a later turn, an ask, a tool
argument or a PR can carry it into the channel; `memory-profile` also works
in a public GitHub thread for a declared commenter.

Settled constraints: specs/ only through SpecSync; owner admins, the team
works; v1 off-chain (no AlgoChat / wallet / MainNet surface); self-merge only
in Corvidinho; ask at the spend cap; #232 / #233 scope untouched. No new
config key, env var, table or schema bump.
