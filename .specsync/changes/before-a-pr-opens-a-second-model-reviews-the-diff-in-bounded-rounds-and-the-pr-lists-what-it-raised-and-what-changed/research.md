---
change: before-a-pr-opens-a-second-model-reviews-the-diff-in-bounded-rounds-and-the-pr-lists-what-it-raised-and-what-changed
artifact: research
---

# Research

- Sources: issue #92 (draft GITHUB-9; steal from corvid-agent
  `server/buddy/service.ts`, `server/work/service-buddy.ts`: lead and buddy
  review rounds), tracker #123 and its decisions comment, Leif's interview
  record `/home/user/coord/interview-2026-09-28.md` (round 3: GITHUB-9 as
  written; round 13: the reviewer is the first other configured model, no
  setting, no second model = no PR), `/home/user/coord/pr-second-review-1.json`
  and the second-review rows of `/home/user/coord/m34-defaults.md` (N = 3 as
  a constant, round N ends the cycle, own counter; an unchanged tree after
  findings completes the cycle; the gate applies to every caller and a caller
  with no run model opens only a finished cycle for the exact tree).
- Every agent path (Discord chat, slash, buttons, `/session`, owner
  schedules, local `task run`, delegate workers) reaches `github-pr-create`
  through `runPlugin` from the `createTaskExecute` tool loop in the same
  process, so the loop can hand the handler its env, authors and a
  completion through its own spend-guarded fetch. `corvidinho plugins run`
  and `openWorkPr` call `runPlugin` with no run.
- `chatCompletions` already turns a thrown `SpendCapRefusal` into a
  completion with `failure: null` (never a model failure), and the spend
  guard's `finish` turns a recorded stop into the run's spend-cap ask; a
  completion with no failure while the run's signal is not aborted is
  therefore a spend stop.
- The AGENT-16 guard counts every `ok: false` result per call signature;
  without an exemption the second identical `github-pr-create` (the decline
  path) would get the steer and the third would end the run with a stuck ask.
- `runGit` strips an inherited `GIT_INDEX_FILE`; staging into a copy of the
  index needs an explicit option. A tree id is content-addressed, so the
  local reviewed tree equals the branch tree on GitHub exactly when the
  content does (`repos.getBranch` gives it; a dry run reads the push remote
  with `git ls-remote`).
- The answer footer prices `usageByModel` rows at each model's own price
  (unknown when one is unpriced), so reporting the review call's usage
  through the run's `onUsage` under the reviewer's label is enough for
  DISCORD-15.a / SAFE-16.
