---
change: work-runs-its-second-model-review-rounds-before-the-pr-and-skips-with-not-reviewed-otherwise-github-9
artifact: context
---

# Context

Tracked under issue #92 (M4, GITHUB-9). GITHUB-9 and GITHUB-9.a are
captured on main (`hi/github.md`, from Leif's 2026-09-28 interview round 3,
"#92 GITHUB-9: capture as written", and the 2026-09-30 round 13 PR-reviewer
call): "Before the PR, a second model reviews the diff in bounded rounds,
and the PR lists what it raised and what changed." / "The reviewer is the
first other model I've configured that didn't write the change; there's no
reviewer setting, and with no second model there's no PR and the reply says
why." Nothing new is captured here.

#341 (b84c75f) built the `github-pr-create` half: every agent run that calls
`github-pr-create` gets the rounds; the `/work` PR step has no run model, so
it started no round and opened only a tree an agent run had already had
reviewed — in practice never, so every `/work` PR was refused after the
branch had been committed and pushed, with a line saying "only an agent run
can start one". REQ-discord-088 named the `/work` round driver "a later
change"; this is it.

Stacked on #348 (repo-ways-3 hi guard, branch `claude/m3-agent18-hi-guard`,
not merged yet): its hi guard sits in the same `loop.ts` gate set and in
`pr.ts` before commit and push; its SpecSync change stays active in this tree
and is left alone.

Constraints: specs only through SpecSync; v1 off-chain; #232/#233 scope
untouched; no new env var, config key, flag, table, schema or protocol
version; reuse #341's reviewer selection, rounds and records (no second
implementation).
