---
change: in-a-hi-repo-it-never-changes-the-criteria-itself-any-hi-change-no-approved-capture-made-blocks-done-and-the-pr-agent
artifact: context
---

# Context

Tracked under issue #89 (M3 "Real dev teammate"). AGENT-18 and AGENT-18.a
are captured on main (`hi/agent.md`, from Leif's 2026-09-28 interview,
round 3: "#89 AGENT-18: capture as written"): "It works each repo's own way:
a SpecSync change where the repo uses SpecSync; where it uses hi, it drafts
criteria and asks before capturing, never inventing them; and Trust where
the repo uses Trust." #329 built the SpecSync clause and AGENT-18.a. This
change is the guard half of the hi clause ("never inventing them"); drafting
criteria and the capture card are the later repo-ways-4 change and Trust is
repo-ways-2, so AGENT-18 stays partial. Nothing new is captured here.

What was wrong on main (b84c75f): in a hi repo a run could change hi/
(criteria, retired entries, intent prose) through `files-write` /
`files-edit` / `files-delete`, the owner shell, a Fledge command or a worker,
and still end verified, and `/work` would commit and push that change in its
PR. The only hi rule was a prompt line ("Never invent criteria") and the
SpecSync answer check that acceptance criteria cite captured ids.

Constraints: specs only through SpecSync; v1 off-chain; #232/#233 scope
untouched; the parallel must-ask-public and safe3a-cli builds' files are not
touched. Corvidinho itself is a hi repo and its coordinator PRs capture
criteria with the external `hi` CLI outside any Corvidinho run: the guard
lives only in a run's verify gate and the `/work` PR step (no CI, lane,
spec-check or git hook), so those captures keep working.
