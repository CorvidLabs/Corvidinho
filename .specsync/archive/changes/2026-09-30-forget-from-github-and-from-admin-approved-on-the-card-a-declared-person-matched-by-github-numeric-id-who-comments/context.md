---
change: forget-from-github-and-from-admin-approved-on-the-card-a-declared-person-matched-by-github-numeric-id-who-comments
artifact: context
---

# Context

Issue #101 (MEMORY: profiles, private notes, forget on request; milestone M1
"Knows everyone"). MEMORY-ACL-6 ("Anyone can ask to be forgotten, and it
forgets once I approve on a card.") shipped with the Discord path only:
`memory-forget-me` from a Discord conversation records a `forget_requests`
ask and the bridge DMs the owner an Approve/Deny card
(`src/discord/forget-card.ts`); on GitHub the tool is refused ("ask on
Discord"), and the owner had no way to start a forget for someone else.

Leif's 2026-09-28 interview, round 12 (2026-09-29,
`/home/user/coord/interview-2026-09-28.md`): "MEMORY-ACL-6 (#101): **both** —
someone known only on GitHub can ask to be forgotten on GitHub (a WATCH comment
raises the owner's Approve/Deny card), and the owner can start a forget for any
declared person with /admin; either way it forgets only after the owner
approves." Captured in this PR's first commit, by hand under MEMORY-ACL-6 in
`hi/memory.md` (`hi` does not parse the multi-part MEMORY-ACL prefix;
`hi check` green):

- **MEMORY-ACL-6.a** "Someone known only on GitHub can ask there to be
  forgotten, and I can start it for any declared person with /admin; either
  way it forgets only after I approve on the card."

Gap on main (20a0f58): a GitHub "forget me" becomes a model run whose
`memory-forget-me` is refused ("a Discord message or command"); `/admin
people` has no forget; `forgetTargets` adds `requesterUserId` to the Discord
ids unconditionally (so a non-Discord asker would be taken for a Discord id);
kept WATCH conversations record logins only, so a person declared by GitHub
id alone is not reached.

Settled constraints: owner admins, team works; v1 off-chain (no AlgoChat /
wallet / MainNet); specs only through SpecSync; #232 / #233 untouched; no
schema bump (the asker kind and GitHub thread go in the existing
`requester_user_id` / `origin_channel_id` columns); IDENTITY-7.a (numeric id
only on GitHub, round 12) is honoured for this path; MEMORY-ACL-1..6 behaviour
for Discord asks unchanged.
