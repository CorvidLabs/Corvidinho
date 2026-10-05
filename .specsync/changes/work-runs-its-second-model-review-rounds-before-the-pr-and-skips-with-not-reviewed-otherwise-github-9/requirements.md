---
change: work-runs-its-second-model-review-rounds-before-the-pr-and-skips-with-not-reviewed-otherwise-github-9
artifact: requirements
---

# Requirements

- GITHUB-9 (captured, `hi/github.md`, Leif 2026-09-28 round 3): "Before the
  PR, a second model reviews the diff in bounded rounds, and the PR lists
  what it raised and what changed."
- GITHUB-9.a (captured, `hi/github.md`, Leif 2026-09-30 round 13): "The
  reviewer is the first other model I've configured that didn't write the
  change; there's no reviewer setting, and with no second model there's no
  PR and the reply says why."
- Built here: the `/work` half — an owner or team `/work` run reviews its
  verified tree in bounded rounds before the PR step, and the PR step commits
  and pushes only a reviewed tree, else says why. #341 built the
  `github-pr-create` half; GITHUB-9 / 9.a are complete for `/work` after this.
- Kept: AGENT-4.a (the verify retries and their counter unchanged), AGENT-14 /
  AGENT-15 (one verify gate; a review step's next attempt is verified again),
  AGENT-18 / 18.a and the hi guard (unchanged, before the review), SAFE-8 /
  AUTONOMY-8 (a review call at the cap asks), SAFE-6 / SAFE-12 (scrubbed,
  fenced), GITHUB-5 / GITHUB-6 (the PR path's gates unchanged), IDENTITY-10 /
  11.a (owner and team `/work` only).
- Modified: REQ-agent-092 (the run's review hook), REQ-plugins-092 (the
  shared step and the `/work` driver), REQ-discord-088 (`not-reviewed` before
  the commit; the frame's `review`; the body line). Added: REQ-cli-092
  (`task run` wires the hook).
- No env var, config key, flag, table, column, schema or protocol change
  (`TaskResult.review` is additive).
