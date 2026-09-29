# Lesson bundle — capture-leif-confirmed-identity-13-14-6-7-and-admin-3-a-declared-people-36-into-hi-from-the-2026-09-28-interview

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Capture Leif-confirmed IDENTITY-13/14/6/7 and ADMIN-3.a (declared people, #36) into hi/ from the 2026-09-28 interview
- **Kind**: Documentation
- **Paths**: hi/identity.md, hi/admin.md, INTENT.md
- **Acceptance**: hi/identity.md holds IDENTITY-13, IDENTITY-14, IDENTITY-6 and IDENTITY-7 and hi/admin.md holds ADMIN-3.a with Leif's confirmed text verbatim (drafts IDENTITY-4/5 renumbered to 13/14 because those ids were taken); INTENT.md's hi index counts them; hi check passes; no other criterion is added or changed

## Evidence

- Verification commit: `89a19b1217f1c36498dc140005bbf6ed896b0379`
- Base commit: `5c867fdd04756f336b6611c0967d462701306711`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

Leif confirmed the #36 criteria in the 2026-09-28 interview (round 6, "#36
people: capture all, renumbered"; round 11, "hi capture: per issue, in its
PR"). They were captured with the `hi` CLI in commit `e54ec96` (this PR's
first commit; `hi <ID> "<text>"`, family file from the id prefix):

- hi/identity.md: **IDENTITY-13** "I declare each person's ids (nicknames,
  GitHub and Discord accounts), and that list is who's who."; **IDENTITY-14**
  "It recognises me and each declared person on Discord and GitHub.";
  **IDENTITY-6** "Only I add, change or remove a person's links, never through
  chat."; **IDENTITY-7** "It matches people on stable ids, never on display
  names."
- hi/admin.md: **ADMIN-3.a** "As owner I can add, change and remove declared
  people and their links with /admin; every change is audited."
- INTENT.md: the `hi` index counts (identity 9, admin 5).

The #36 drafts IDENTITY-4/5 collide with captured ids and were renumbered to
IDENTITY-13/14 (IDENTITY-8..12 are the #65 roles drafts). AlgoChat / wallet
ids in the original drafts are Post-v1 and not in the captured text. The build
is the separate change
`declared-people-the-owner-declares-who-s-who-in-the-allowlist-file-corvidinho-recognises-the-owner-and-each-declared`.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
