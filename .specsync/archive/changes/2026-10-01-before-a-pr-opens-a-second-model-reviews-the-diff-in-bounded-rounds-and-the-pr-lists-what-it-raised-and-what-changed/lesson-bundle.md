# Lesson bundle — before-a-pr-opens-a-second-model-reviews-the-diff-in-bounded-rounds-and-the-pr-lists-what-it-raised-and-what-changed

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Before a PR opens, a second model reviews the diff in bounded rounds, and the PR lists what it raised and what changed (GITHUB-9, GITHUB-9.a)
- **Kind**: Feature
- **Specs**: plugins, agent, discord
- **Paths**: hi/github.md, INTENT.md, plugins/git/exec.ts, src/plugins/types.ts, src/plugins/run.ts, plugins/github/commands.ts, src/agent/execute.ts, src/autonomous/delegate.ts, plugins/autonomous/commands.ts, src/work/pr.ts, src/work/review.ts, src/store/scrub.ts, tests/work.review.test.ts, tests/fixtures/review-cycle.ts, tests/github.write.plugin.test.ts, tests/roles.chat.gates.test.ts, tests/work.pr.test.ts, specs/plugins/plugins.spec.md, specs/plugins/testing.md, specs/agent/agent.spec.md, specs/agent/testing.md, specs/discord/discord.spec.md, specs/discord/testing.md, README.md, docs/discord.md, docs/DISCORD-GO-LIVE.md, docs/WATCH.md
- **Acceptance**: GITHUB-9 (captured on main from Leif's 2026-09-28 interview) and GITHUB-9.a (captured in this change with hi from Leif's 2026-09-30 interview round 13) hold for every github-pr-create path — a chat, slash or button run, a local task run and a delegate worker hand the handler their run (env, authors, one no-tools completion through the run's providers call path and SAFE-8 spend guard), while corvidinho plugins run and the /work PR step have no run model: with a run model the run's work tree is staged into a temporary GIT_INDEX_FILE (real index untouched) and its diff against the merge-base with --base (scrubbed, fenced as untrusted data, capped at 200 KiB) is reviewed by the first configured model (CORVIDINHO_LLM_MODEL then _READ/_TOOL/_CODE, every chain entry, key set) whose model id is none of the change's authors (the run chain's models incl. AGENT-11 fallbacks, delegate workers' reported models and a worker's lead's via CORVIDINHO_DELEGATE_AUTHORS, authors recorded for the branch); there is no reviewer setting; round k of REVIEW_MAX_ROUNDS = 3 that raises findings (at most 10, scrubbed) holds the PR with them fenced and reviewHold findings; a clean round, an unchanged tree after findings (declined, listed as not changed) or round 3 ends the cycle; rounds are stored in the lazily created pr_review_rounds table keyed (repo, branch) and tied to tree ids (no schema version bump; listed in SCRUB_TARGETS); the branch on GitHub (dry run: the push remote) must be the reviewed tree; the PR body gets a '## Second-model review' section with the reviewer, rounds used of 3, what each round raised and the changed paths from git, fenced, no amounts; without a run model no round starts and only a finished cycle for the exact tree on GitHub opens the PR (/work says why on its PR line, reason not-reviewed); no second model, a provider error (fixed reason), a diff over the cap, no changes, an unpushed or different branch tree each refuse in one plain line, and the run's reply ends with that line (GITHUB-9.a); a SpendCapRefusal of the review call ends the attempt at the spend cap's ask, never 'unavailable'; review holds never count toward AGENT-16/17; the reviewer's usage is recorded under its own label so the owner footer prices it or shows unknown; must-ask and repo gates still apply first; tests/work.review.test.ts and the updated github-write, roles and work.pr tests fail on the base sources and pass on the branch

## Evidence

- Verification commit: `9fec635564101d7fdd39b10b4ada2f01fdf73c19`
- Base commit: `3799e4ebd1cd3a3d7f72a97fd42184ac0a10a28d`
- Verified by: `specsync check --spec agent --spec discord --spec plugins`

## From the change's context.md

# Context

Tracked under issue #92 (WORK: buddy review by a second model before the PR,
draft GITHUB-9) and the M3 "Real dev teammate" tracker #123 (slice
second-review-1 of the M3/M4 plan). GITHUB-9 is captured on main from Leif's
2026-09-28 interview (round 3: "capture as written"): "Before the PR, a
second model reviews the diff in bounded rounds, and the PR lists what it
raised and what changed." Leif's round 13 decision (2026-09-30, record of the
2026-09-28 interview) is captured in this change with `hi` as GITHUB-9.a:
"The reviewer is the first other model I've configured that didn't write the
change; there's no reviewer setting, and with no second model there's no PR
and the reply says why."

What was wrong on main (9ea766b): `github-pr-create` opened a PR from any
caller with no review at all, so a chat, slash, button or CLI run, a delegate
worker and the /work PR step could each open an unreviewed PR.

Constraints: specs only through SpecSync; v1 off-chain; #232/#233 scope
untouched; no new config key or env var a person sets (the reviewer comes
from the existing AGENT-13 model keys; `CORVIDINHO_DELEGATE_AUTHORS` is an
internal lead-to-worker value like `CORVIDINHO_DELEGATE_DEPTH`); no schema
version bump (main is v15; the new table is created on first use). The
parallel providers-4 build owns the turn cap / idle watchdog regions of
`src/agent/execute.ts`; this change does not touch `chatCompletions` or the
round loop's caps, only the tool dispatch and the run's hooks. The /work
round driver is the later second-review-2 change: until it lands, /work (no
run model) opens only a tree an agent run already had reviewed, so GITHUB-9
is partial for /work. Where the captured text leaves a question open, the
conservative defaults in `/home/user/coord/m34-defaults.md` (second-review
rows) and the slice entry `/home/user/coord/pr-second-review-1.json` are used
and listed in the PR under "Design choices pending Leif".

## From the change's design.md

# Design

- **New module** `src/work/review.ts` (owned by the plugins spec):
  `gatePrCreate` decides from the latest stored cycle for (repo, head) and,
  with a run, the work tree's id from `reviewTree` (index copy + `git add
  --update` + `write-tree` under a temporary `GIT_INDEX_FILE`, new `runGit`
  option `indexFile`: tracked files only, untracked never count). Same tree as the open round → `declined`; same tree
  as a finished cycle → no round; else the next round: `resolveReviewer`
  over `configuredModels` minus authors (run + recorded for the checkout by
  earlier runs + recorded for the branch's rounds, by model id), merge-base
  with `--base`, `reviewDiffText` (200 KiB cap; secret-looking paths
  excluded with `SECRET_GIT_EXCLUDE_PATHSPECS` and named, fail closed),
  `changedPaths` from the previous round's tree (or the last tree of an
  earlier cycle no PR listed), `reviewDiff` (one
  `PrReviewRun.complete` call; `ReviewSpendStop` on a spend stop),
  `recordReviewRound`. A cycle ends `clean`, `declined` or `max-rounds`
  (round 3); an unfinished round returns the `findings` hold. A finished
  cycle then needs the branch tree on GitHub (`remoteTree`) to equal it,
  and `reviewSection` renders the body section from the stored rounds —
  the finishing cycle plus earlier cycles with no `opened_at`
  (`unopenedEarlierRounds`); `markReviewOpened` sets it after a live
  `pulls.create`.
- **github-pr-create** (`plugins/github/commands.ts`): live mode builds its
  Octokit client first (no review spent without a token), then the gate with
  `githubBranchTree` (live) or `pushRemoteTree` (dry run);
  `withReviewAndAttribution` puts the section before the attribution.
- **Types** (`src/plugins/types.ts`): `PrReviewRun`, `ReviewMessage`,
  `ReviewCompletion`, `PluginHandlerArgs.review`,
  `PluginHandlerResult.reviewHold`; `runPlugin` passes `review` through.
- **Tool loop** (`src/agent/execute.ts`): an `authors` set fed by
  `onModel`, own and worker failovers, `delegate` `data.models` and (in a
  worker) `CORVIDINHO_DELEGATE_AUTHORS`; one `PrReviewRun` whose `complete`
  calls the existing `chatCompletions` with no tools, the spend-guarded
  fetch and the run's `onUsage`; `ReviewSpendStop` ends the attempt so
  `spend.finish` makes the ask; `reviewHold` results skip
  `repeatGuard.after`; the latest refusal line ends the summary
  (`withReviewRefusalNote`); after a call that changed (or may have changed)
  the checkout it records the run's authors (`recordChangeAuthors` →
  `pr_change_authors`, keyed by top level and branch, deduped per process).
  The turn-cap / idle-watchdog regions and
  `chatCompletions` itself are untouched (providers-4 builds there).
- **Delegate** (`src/autonomous/delegate.ts`, `plugins/autonomous/commands.ts`):
  `workerModelsFromResult` → `DelegateChildOutcome.models` → `data.models`;
  `buildDelegateSpawn({ authors })` sets `CORVIDINHO_DELEGATE_AUTHORS`.
- **/work** (`src/work/pr.ts`): a held `github-pr-create` maps to
  `not-reviewed` with the gate's reason (`reviewRefusalReason`).
- **Scrub** (`src/store/scrub.ts`): `pr_review_rounds` and
  `pr_change_authors` in `SCRUB_TARGETS`.

## From the change's testing.md

# Testing

Temp git repos only (never this checkout), each with a local bare `origin`
at `…/acme/review-fixture.git` (`tests/fixtures/review-cycle.ts`); dry-run
`github-pr-create` (the branch's tree read from the bare remote with
`git ls-remote`); a scripted `PrReviewRun` for the gate cases and a
scripted provider fetch (the fake LLM pattern of
`tests/fixtures/fake-llm.ts`: tool calls for the run's model, JSON findings
for the reviewer) for the tool-loop cases; a mocked Octokit fetch for the
live branch tree; the test data dir's shared DB. No network, no real tokens.

Fail-on-base proof: with the base's (9ea766b) nine modified sources swapped
in (`plugins/git/exec.ts`, `src/plugins/types.ts`, `src/plugins/run.ts`,
`plugins/github/commands.ts`, `src/agent/execute.ts`,
`src/autonomous/delegate.ts`, `plugins/autonomous/commands.ts`,
`src/work/pr.ts`, `src/store/scrub.ts`; the new `src/work/review.ts` kept),
`bun test tests/work.review.test.ts tests/github.write.plugin.test.ts
tests/roles.chat.gates.test.ts tests/work.pr.test.ts` gave 39 pass, 5 fail:
`tests/work.review.test.ts` cannot load (`githubBranchTree` missing), the two
github-write attribution cases and roles (b) fail (no review section, the
PR opens with no review), and work.pr's shipping case fails (base `runGit`
ignores `indexFile`, so staging the review tree touched the real index).
With the missing exports stubbed so the file loads,
`tests/work.review.test.ts` gave 8 pass, 23 fail: every gate case with and
without a run model, the /work case, all five tool-loop cases, both delegate
cases, the live branch tree and `SCRUB_TARGETS`; the 8 that pass are the new
module's pure units (reviewer choice, findings parse, messages, section) and
the live-mode token check. Restored: the four files 74 of 74.

Review fixes (second pass): `reviewTree` stages tracked files only
(`git add --update`), the review diff leaves out secret-looking paths'
content (named only), the tool loop records the run's authors per checkout
(`pr_change_authors`) and the gate counts them, and the PR section lists
earlier cycles no opened PR listed (`opened_at`, `markReviewOpened`). With
the pre-fix sources of this change (`src/work/review.ts`,
`src/agent/execute.ts`, `plugins/github/commands.ts`, `src/store/scrub.ts`
at `69257ea`) swapped in and the three new exports stubbed,
`tests/work.review.test.ts tests/work.pr.test.ts` gave 49 pass, 9 fail: the
updated `reviewTree` case (the untracked file counted), the untracked
scratch file (remote mismatch), both secret-path cases (content sent), the
earlier run's author (it reviewed its own change), the earlier cycle's
rounds (missing from the PR), the marked rounds, the live marking and
`recordChangeAuthors`. `tests/work.pr.test.ts` now seeds its reviews with
the fixture's `fullWorkTree` (a temp index of the whole work tree, what
/work commits), so with the merge-base's (`9ea766b`) nine sources it passes:
it only adapts to the gate; the base proof is the github-write and roles
cases (3 fail). Restored: the four files 82 of 82.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-092` | `tests/work.review.test.ts` ("resolveReviewer: the first other configured model …") | Configured models in key order, each once; authors skipped by model id across kinds; no key skipped; null with no second model; no reviewer key read. |
| `REQ-plugins-092` | `tests/work.review.test.ts` ("reviewTree stages the work tree's tracked files …", "untracked files are not part of the reviewed tree …") | The temp-index tree equals a commit of the tracked files (edit, staged new file, deletion; the untracked file left out); status and staged list unchanged; an untracked scratch file neither blocks the PR nor reaches the reviewer. |
| `REQ-plugins-092` | `tests/work.review.test.ts` ("a secret-looking path's content is never sent …", "a change to secret-looking paths only …") | `.env.local`, `config/credentials.json`, `.env.production` named to the reviewer, their content never sent. |
| `REQ-plugins-092` | `tests/work.review.test.ts` ("rounds of an earlier review that opened no PR stay listed …", "after a PR opened listing them (marked) …", "a live PR marks the rounds …") | An earlier cycle's finding and the paths changed since (`M  src/app.ts`, `A  src/more.ts`) are listed; marked rounds are not listed again; a live `pulls.create` (mocked fetch) marks them. |
| `REQ-plugins-092` | `tests/work.review.test.ts` ("parseReviewFindings and the review call's messages") | JSON / fenced / bullets / clean / other text; 10 kept, rest counted; scrubbed before the cut; the diff scrubbed and fenced, its fence marker defanged. |
| `REQ-plugins-092` | `tests/work.review.test.ts` ("round 1 findings hold the PR …", "the author may decline …", "round 3 always ends the cycle …") | Findings hold (round 1 of 3, fenced); change → round 2 clean → section (2 of 3 rounds, finding, `M  src/app.ts`, no amounts); decline listed as not changed; round 3 ends the cycle and the same tree reopens with no 4th call. |
| `REQ-plugins-092` | `tests/work.review.test.ts` ("the branch on GitHub must be the reviewed tree …", "a branch not on GitHub yet …") | Unpushed edits, an unpushed branch, no changes and a non-git cwd refuse in one line; after the push it opens with no new call. |
| `REQ-plugins-092` | `tests/work.review.test.ts` ("no second model …", "an author recorded …", "a provider error …", "a diff over the cap …", "a spend-cap stop … ReviewSpendStop propagates") | GITHUB-9.a line and no call; recorded authors never review; fixed provider reason; over-cap refusal; `ReviewSpendStop`; nothing recorded. |
| `REQ-plugins-092` | `tests/work.review.test.ts` ("a heading in the caller's body …", "live mode needs its GitHub client …") | Imitation heading quoted, one real section; no token fails before any review call. |
| `REQ-plugins-092` | `tests/work.review.test.ts` ("no finished cycle refuses in one line …") | Without a run model only a finished cycle for the exact pushed tree opens; another tree or an open cycle refuses. |
| `REQ-plugins-092` | `tests/work.review.test.ts` ("githubBranchTree …", "reviewSection …", "pr_review_rounds is re-scrubbed …") | Live branch tree (owner:branch, 404 null); fenced, scrubbed section with no amounts; `SCRUB_TARGETS` row. |
| `REQ-plugins-092` | `tests/github.write.plugin.test.ts` (dry-run pr-create cases), `tests/roles.chat.gates.test.ts` ("(b) admin github-pr-create …") | The section sits between the body and one footer; ADMIN reaches the GITHUB-9 gate, never the role refusal, and opens with a finished review. |
| `REQ-plugins-117` | `tests/work.review.test.ts` ("buildDelegateSpawn passes the lead's authors …", "delegateAuthorsFromEnv and workerModelsFromResult …") | Lead authors in the worker env, inherited value dropped; worker models validated and bounded. |
| `REQ-agent-092` | `tests/work.review.test.ts` ("the reviewer is the first other configured model, called once with no tools …") | One no-tools review call through the run's fetch to the READ-tier model; fenced diff; usage under the reviewer's label (footer cost unknown for an unpriced reviewer); `onModel` stays the run's; no AGENT-16 steer. |
| `REQ-agent-092` | `tests/work.review.test.ts` ("with no second model every call refuses …") | Three identical refusals, no steer, no stuck ask; the summary ends with the GITHUB-9.a line. |
| `REQ-agent-092` | `tests/work.review.test.ts` ("a spend-cap stop of the review call ends the run …") | `spend-cap` ask; no review request sent; nothing recorded; no "PR not opened" line. |
| `REQ-agent-092` | `tests/work.review.test.ts` ("a delegate worker's models are authors too …") | The worker's model is skipped; the next configured model reviews. |
| `REQ-agent-092` | `tests/work.review.test.ts` ("a model that wrote the change in an earlier run …", "recordChangeAuthors keeps each model once …") | Run 1's fallback model, which wrote the change, is never run 2's reviewer (the third model is); each (checkout, branch, model) once, scrubbed, nothing below a top level; `SCRUB_TARGETS` lists `pr_change_authors`. |
| `REQ-agent-092` | `tests/work.review.test.ts` ("a second call in the same batch as the findings is not run …") | The second call is held unrun; one review call; the cycle stays open. |
| `REQ-agent-117` | `tests/work.review.test.ts` ("delegate workers report their models and get the lead's authors") | `CORVIDINHO_DELEGATE_AUTHORS` from `authors`; worker models from the result frame. |
| `REQ-discord-088` | `tests/work.review.test.ts` ("/work: with no finished review …"), `tests/work.pr.test.ts` ("dirty verified worktree …", "GITHUB-6 default gate …") | `not-reviewed` line with the gate's reason and the branch pushed; with a finished review for the pushed tree /work commits, pushes and opens with the section. |

## Where these lessons go

- `specs/plugins/context.md`
- `specs/agent/context.md`
- `specs/discord/context.md`
