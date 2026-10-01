---
module: plugins
change: before-a-pr-opens-a-second-model-reviews-the-diff-in-bounded-rounds-and-the-pr-lists-what-it-raised-and-what-changed
---

# Delta: plugins (github-pr-create opens a PR only after a second-model review in bounded rounds — GITHUB-9, GITHUB-9.a)

## Added

### REQUIREMENT REQ-plugins-092

Before the PR, a second model reviews the diff in bounded rounds, and the PR
lists what it raised and what changed (GITHUB-9, captured on main from
Leif's 2026-09-28 interview). The reviewer is the first other model I've
configured that didn't write the change; there's no reviewer setting, and
with no second model there's no PR and the reply says why (GITHUB-9.a,
captured in this change from Leif's 2026-09-30 interview, round 13).

`github-pr-create` SHALL run `gatePrCreate` (`src/work/review.ts`) for every
caller, after the repo gate (GITHUB-6) and argument checks and, in live mode,
after its Octokit client exists, and before anything reaches GitHub; the
SAFE-1 deny, the must-ask gate and the role gate of `runPlugin` still apply
first. It SHALL open a PR only for a tree with a finished review cycle:

- **With a run model** (the handler got `review`, a `PrReviewRun`, from the
  agent tool loop, REQ-agent-092): the gate SHALL stage the work tree's
  tracked files at the handler cwd (the repository top level, `gitRoot`)
  into a copy of the index (`git add --update`; `runGit`'s `indexFile` sets a
  temporary `GIT_INDEX_FILE`; the inherited one is still stripped) and write
  its tree (`reviewTree`): tracked edits, deletions and files already staged
  count; untracked files do not (they are not what the PR carries, so a
  scratch file never holds the PR back and its content never reaches the
  reviewer); the real index and status do not change. When the latest cycle for (repo, head) ended on this
  tree, no round runs. When its open round reviewed this tree (findings,
  unchanged since), the author declined them: the cycle SHALL end
  (`declined`) and they are listed as not changed. Otherwise the next round
  (round 1 of a new cycle after a finished one) SHALL review the diff from
  the merge-base of HEAD with `--base` (`refs/remotes/origin/<base>`, else
  `refs/heads/<base>`) to the tree: the reviewer is `resolveReviewer(env,
  authors)` — the first entry of `CORVIDINHO_LLM_MODEL`, then
  `CORVIDINHO_LLM_MODEL_READ`, `_TOOL` and `_CODE` (every chain entry, each
  label once) that has its key and whose model id (whatever kind reaches it)
  is none of the authors: the run's `authors()`, every model recorded as
  having changed this checkout (`pr_change_authors`, REQ-agent-092: its top
  level on the branch checked out now, the head branch, or detached) and
  every author recorded for (repo, head). There is no reviewer setting. One no-tools completion
  (`review.complete`) SHALL carry fixed instructions and, as untrusted data
  (SAFE-12 fence), the title and the diff, secret-scrubbed (SAFE-6) and at
  most `REVIEW_DIFF_MAX_BYTES` (200 KiB, the `github-pr-diff` cap; a bigger
  diff is refused, never cut). The diff SHALL leave out the content of every
  secret-looking path (`isSecretPath`, the ROLES-CHAT-8 rules: `.env*`,
  `.ssh`, keystores, keys, credentials; `SECRET_GIT_EXCLUDE_PATHSPECS`) and
  name those paths instead (content withheld), and a secret path found past
  the excludes SHALL fail closed (a one-line refusal, no call). The reply's findings (the `findings` array of
  its JSON, else its bullet lines, else an explicit clean reply means none,
  else the whole text is one finding) SHALL be scrubbed before they are cut
  to one line of `REVIEW_FINDING_MAX_CHARS` and kept to
  `REVIEW_FINDINGS_MAX` (10; the rest counted). A round that raises nothing
  ends the cycle (`clean`); round `REVIEW_MAX_ROUNDS` (3, a constant, its
  own counter, not the AGENT-4.a verify retries) always ends it
  (`max-rounds`); any other round with findings SHALL refuse with
  `reviewHold: "findings"`, exit 2, a fixed line naming round k of 3 and the
  reviewer and saying how to go on (change, commit and push, then call again;
  or call again unchanged to open with them listed as not changed), and the
  findings numbered inside an untrusted-data fence; `data.review` carries
  only the round, the maximum, the reviewer and the count. Each round SHALL
  be stored in the `pr_review_rounds` table (created on first use, no
  schema version bump; keyed (repo lower-cased, head) with cycle and round,
  tied to the reviewed tree id; reviewer, authors, findings and the changed
  paths since the previous round's tree — `git diff --name-status` between
  the two trees, at most `REVIEW_PATHS_MAX` — scrubbed on write and listed in
  `SCRUB_TARGETS`; `opened_at` once a PR listed it). Round 1 of a new cycle
  after one that ended with no PR listing it SHALL record the paths changed
  since that cycle's last tree.
- **Without a run model** (`corvidinho plugins run github-pr-create`, the
  /work PR step, REQ-discord-088): no round SHALL start; the PR opens only
  when the latest cycle for (repo, head) ended on the exact tree of the
  branch on GitHub.

Either way the branch on GitHub SHALL be the reviewed tree — read with
`repos.getBranch` (an `owner:branch` head on that owner's same-named repo;
`githubBranchTree`), or in a dry run (`CORVIDINHO_GITHUB_DRY_RUN=1`) from
the push remote with `git ls-remote origin` (`pushRemoteTree`). The opened
PR's body SHALL be the caller's body (a heading in it that imitates the
section marked `(quoted)`), then a `## Second-model review` section, then
the attribution (placed after the section when the body already ended with
it): rounds used of 3, each round's reviewer and what it raised (fenced,
numbered), the paths that changed after each round (fenced), and for the
last round's findings, not changed (declined, or round 3 ends the review);
scrubbed, with no amounts. It SHALL list every round since the last PR
opened from the branch: the finishing cycle and, before it, each earlier
cycle of (repo, head) no opened PR listed (`opened_at` unset;
`unopenedEarlierRounds`), so a review that ended before the tree changed
again stays listed. Once a live `pulls.create` succeeds, the rounds it
listed SHALL be marked (`markReviewOpened`, best effort); a dry run marks
nothing.

Anything else SHALL refuse with `reviewHold: "refused"`, exit 2, and one
plain line starting `PR not opened: ` (`REVIEW_REFUSAL`): no second model
(GITHUB-9.a), no finished review for the tree (no run model), not a git
checkout top level, the tree or base unreadable, no changes against the base,
a diff over the cap, a provider error (a fixed reason from
`modelFailureReason`, never provider text) or an empty reply, the record
unavailable, the branch unreadable on GitHub or not the reviewed tree. A
refused or failed review records nothing. A review call stopped at a SAFE-8
spend cap (a completion with no model failure while the run was not stopped)
SHALL throw `ReviewSpendStop` instead, so the run stops at the cap's Approve
card or ask (REQ-agent-092), never "unavailable".

Acceptance Criteria
- `resolveReviewer` lists configured models in `CORVIDINHO_LLM_MODEL`, `_READ`, `_TOOL`, `_CODE` order, each label once; skips authors by model id across kinds and entries without their key; returns null when only authors remain; no other env key names a reviewer.
- `reviewTree` of a work tree with an edit, a staged new file, an untracked file and a deletion equals the tree a commit of the tracked files then has (the untracked file left out), and leaves `git status` and the staged list unchanged; an untracked scratch file beside the pushed branch neither blocks the PR nor reaches the reviewer.
- A committed `.env.local` and `config/credentials.json` are named to the reviewer but their content is never sent; a change to secret-looking paths only is still reviewed by name.
- Findings parse from JSON, a fenced JSON block, bullets; an explicit clean reply is none; other text is one finding; capped at 10 with the rest counted; scrubbed before the cut. The review call's user message is the scrubbed title and diff in an untrusted fence the diff cannot close.
- With a run model (dry run, temp repos with a bare origin): round 1 findings refuse with `reviewHold: findings`, round 1 of 3, the reviewer, the fenced findings; after a change is committed and pushed, a clean round 2 opens the PR whose body has the section (2 of 3 rounds, round 1's finding, `M  src/app.ts` changed after round 1, round 2 raised nothing, no amounts) before the attribution.
- The same tree after findings opens with them listed as not changed (`declined`); round 3 with findings opens (`max-rounds`) and the same tree later opens with no 4th review call.
- Unpushed edits, a branch not on GitHub, no changes against the base and a non-git cwd refuse in one line; after the push the PR opens with no new review call.
- A cycle that ended (clean round 2 on an unpushed edit) and a new cycle on the pushed, changed tree: the PR lists round 1's finding, `M  src/app.ts` and `A  src/more.ts`; after the rounds were marked opened, a later cycle lists only its own rounds; a live `pulls.create` (mocked fetch) marks the rounds it listed.
- No second model refuses with the GITHUB-9.a line and calls no reviewer; a provider error refuses with `<reviewer> failed (HTTP 500)` and none of the provider's text; a diff over 200 KiB refuses and calls no reviewer; none of these records a round; an author recorded for the branch is never its reviewer.
- A review completion with no model failure (a spend-cap stop) makes `runPlugin` reject with `ReviewSpendStop` and records nothing.
- Without a run model: no finished cycle, a finished cycle for another tree, or an open cycle refuse in one line; a finished cycle for the pushed tree opens with its findings listed. Live mode without a token fails before any review call.
- `githubBranchTree` returns the head commit's tree, reads an `owner:branch` head on that owner's repo, and is null on a 404. `SCRUB_TARGETS` lists `pr_review_rounds` (`reviewer`; JSON `authors`, `findings`, `changed`) and `pr_change_authors` (`model`).

## Modified

### REQUIREMENT REQ-plugins-117

The system SHALL register autonomous extras as plugins (PLUGIN-5) from
`plugins/autonomous/` via builtins. `PluginCommand` SHALL accept
`autonomous?: boolean` (left out of the agent tool catalog unless the session
is allowed, REQ-agent-117 / SAFE-9). `PluginHandlerArgs` and `runPlugin`
options SHALL accept optional `tier` and `signal`, passed through to the
handler unchanged when given, and an optional `review` (`PrReviewRun`: the
calling agent run's env, change authors and review call, GITHUB-9 /
REQ-agent-092), passed through the same way.

The `delegate` command SHALL declare `dangerous: false`, `mutating: true`,
`minTier: 2` and `autonomous: true` (PLUGIN-2). Being mutating (ROLES-CHAT-5:
a worker runs tools), a non-ADMIN role session SHALL never see it in the tool
catalog and `runPlugin` SHALL refuse it with exit 2 "not allowed for your role"
before the handler runs, spawning nothing (ROLES-CHAT-2/3/6). Its handler
SHALL, in order: parse
`[--skill NAME] [--tier read|tool|code] --task TEXT` (or positional text; the
skill is a short lowercase `[a-z0-9_-]` label; `--task` takes the next item
even when it starts with `-`) and exit 1 on a usage error; refuse with exit 2
and without spawning when the cwd's project has not enabled autonomous mode
(AUTONOMOUS-1), when the delegation depth cap is reached, when the lead's tier
(the handler `tier`, else `CORVIDINHO_LLM_TIER`, default `tool`) is below
code, or when the concurrency / per-run budget is spent; otherwise run one
worker (REQ-agent-117) in the plugin cwd with the lead's allowlist and abort
signal. The result data SHALL carry `skill`, `tier`, `tierClamped`, `depth`,
`exitCode`, `state`, `summary`, `filesChanged` and, when present,
`verified`, `verifySkipped`, `totalTokens`, `timedOut`, `aborted` and
`models` (the worker's models, `DelegateChildOutcome.models`, GITHUB-9), so
the lead can synthesize the result (AUTONOMOUS-5). When the handler has a
`review` context, the worker SHALL be spawned with the lead's change authors
(`review.authors()`, REQ-agent-117), so a PR the worker opens is never
reviewed by a model that wrote part of it. The result SHALL be ok only when the worker exits 0 in state
`done`.

Acceptance Criteria
- `delegate` is registered with dangerous=false, mutating=true, minTier=2, autonomous=true.
- A non-ADMIN role session's `runPlugin delegate` is refused with exit 2 "not allowed for your role" and spawns nothing.
- Autonomous off, depth 2, tool tier, an omitted tier with the default env tier, and a spent budget are refused with exit 2 and spawn nothing; bad args exit 1.
- Happy path against a fake bin: argv has `task run --here` (REQ-cli-122), `--non-interactive`, no `--no-verify`, the clamped `--tier`, and `--task` last with the skill / depth provenance header; env has depth 1, the worker tier, non-interactive, the lead allowlist, ADMIN 0 for a role-session lead and no confirm tokens; data carries skill / tier / depth / state / filesChanged / verified / verifySkipped.
- A failed worker yields ok=false with its exit code and a SAFE-6 scrubbed summary.
- GITHUB-9: a worker result naming its model, usage models or failovers returns them as `data.models`; with a `review` context the worker env carries the lead's authors (`CORVIDINHO_DELEGATE_AUTHORS`), without one it carries none (an inherited value is dropped).
