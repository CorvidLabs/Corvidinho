---
change: it-can-merge-its-own-corvidinho-pr-when-i-ask-and-every-gate-is-green-never-its-gates-never-someone-else-s-github-7
artifact: context
---

# Context

Tracked under issue #124 (M4 "Safe autonomy", #99 in its build order).
GITHUB-7 is captured on main (`hi/github.md`, Leif's 2026-09-28 interview,
round 4: "#99 GITHUB-7: capture, Corvidinho-only"): "It may merge its own
Corvidinho PR when verify and CI are green and branch protection, reviews and
CODEOWNERS allow it; it never bypasses them, never merges someone else's PR,
and outside Corvidinho a human still merges." Round 16 of the same interview
record (2026-10-06, "GITHUB-7 self-merge: safe defaults") gives the
sub-criterion captured with `hi` in this change as GITHUB-7.a: "It merges only
PRs it opened from its own talk branches with its own token, and only when I
ask; it never marks its own /work draft ready, won't merge a PR that changes
its own gates (.github, fledge.toml, hi/, AGENTS.md, CODEOWNERS), and counts
CI green only when smoke and spec-sync pass at the head."

What was missing on main (86d68cd0): no tool could merge a PR at all. The
shell, runners and Fledge runs start without the owner's GitHub or git
credentials (SAFE-21.a; round 13: "pushes, PRs and merges happen only through
the checked GitHub tools and their gates"), `github-pr-create` opens PRs
(`/work` opens drafts) and nothing marks a draft ready. This change adds the
one checked merge tool.

Round 13 of the same record (2026-09-30) also says self-merge takes "only
PRs a human has marked ready"; round 16 keeps that as "it never marks its
own /work draft ready". `github-pr-create` opens a ready PR unless asked for
`--draft`, so the gate requires a person's `ready_for_review` event, not
only a non-draft PR.

Since the first draft of this change, main gained IDENTITY-12.a (#374): a
WATCH run the owner's own GitHub comment triggered now gets the owner's other
tools behind the must-ask gate, so the role gate alone no longer keeps a
WATCH run off an owner-only tool. The self-merge caller check refuses WATCH
by its session id and by its `watch` surface stamp, the owner's own run
included (it is not "the owner's own interactive run"). Main also made
`.trust.toml` a SAFE-2 gate file (AGENT-18 Trust clause), so it is a
self-merge gate path too. This change was rebuilt on 86d68cd0 after an
earlier attempt on e1a24ed2 that was never pushed.

Constraints: specs only through SpecSync; owner admins, team works; v1
off-chain (no AlgoChat / wallet / MainNet surface); self-merge only in
Corvidinho; ask at the spend cap; #232 / #233 scope untouched. No env var,
config key or schema change. The repo's CI jobs are `smoke` (ci.yml: install,
`--help`, `bun test`, `tsc --noEmit`) and `spec-sync` (spec-sync.yml:
`specsync check --require-coverage 100` + `change audit`), checked against
the live check-run names on main.
