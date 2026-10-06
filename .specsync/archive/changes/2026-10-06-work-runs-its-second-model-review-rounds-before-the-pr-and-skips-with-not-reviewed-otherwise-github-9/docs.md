---
change: work-runs-its-second-model-review-rounds-before-the-pr-and-skips-with-not-reviewed-otherwise-github-9
artifact: docs
---

# Docs

- `docs/discord.md`: the `/work` command row says the verified tree gets the
  second-model review before the draft PR and what `not-reviewed` means; the
  `/work` PR gate table's GITHUB-9 row is now checked before the commit
  (nothing pushed) and names the GITHUB-9.a line; the Second-model review
  section gains the `/work` bullet (who, what tree, feedback, own counter,
  spend cap) and the no-run-model bullet drops `/work`.
- `docs/DISCORD-GO-LIVE.md`: the `/work` PR step paragraph no longer calls
  the round driver a later change.
- Specs: `agent.spec.md` (the `/work` review paragraph, a scenario),
  `cli.spec.md` (`workReviewApplies` row, the wiring paragraph),
  `discord.spec.md` (`not-reviewed` before the commit, `reviewed` body line,
  the frame's `review`), `plugins.spec.md` (the `/work` driver in the prose
  and exports); each module's `testing.md`; REQ-agent-092, REQ-plugins-092
  and REQ-discord-088 modified, REQ-cli-092 added.
- README already says the PR opens only after a second model reviewed it and
  stays true. No CHANGELOG, STATUS or package.json edit.
