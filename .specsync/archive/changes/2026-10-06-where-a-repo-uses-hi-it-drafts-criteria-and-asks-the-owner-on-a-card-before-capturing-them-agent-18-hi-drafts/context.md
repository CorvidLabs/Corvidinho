---
change: where-a-repo-uses-hi-it-drafts-criteria-and-asks-the-owner-on-a-card-before-capturing-them-agent-18-hi-drafts
artifact: context
---

# Context

AGENT-18 is captured on main (`hi/agent.md`, Leif's 2026-09-28 interview,
round 3: "capture as written"): "It works each repo's own way: a SpecSync
change where the repo uses SpecSync; where it uses hi, it drafts criteria and
asks before capturing, never inventing them; and Trust where the repo uses
Trust." The SpecSync clause shipped in #329; #348 (squash-merged to main as
8bf4422f; this branch was cut from its head and has since merged main) built
the guard half of the hi clause ("never inventing them"): any `hi/` change no approved capture made
blocks done and the PR, and since no run could make an approved capture, all
of them did. The Trust clause is a parallel PR.

This change builds the other half of the hi clause: "drafts criteria and asks
before capturing". Nothing new is captured in `hi/` (AGENT-18 is already
there). The design decisions come from the M3/M4 plan (`repo-ways-4`) and the
repo-ways rows of `/home/user/coord/m34-defaults.md`: only Corvidinho's
configured owner confirms drafted criteria, through the SAFE-18 DM card, and
nobody else's press or reply captures anything; owner and team runs and the
local CLI may draft, community runs and delegate / council workers may not;
capture always needs the owner's Approve.

Settled rules that still hold: specs/ only through SpecSync; owner admins and
the team works; v1 is off-chain; self-merge only in Corvidinho; ask at the
spend cap. #232 / #233 scope is untouched. Other builds in the same wave edit
`admin-allowlist.ts`, `admin.ts`, `verify.ts` and `src/work/pr.ts`, so the
`pr.ts` edit here is two comment lines.
