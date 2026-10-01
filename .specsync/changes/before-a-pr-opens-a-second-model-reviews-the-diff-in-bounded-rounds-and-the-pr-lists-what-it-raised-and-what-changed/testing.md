---
change: before-a-pr-opens-a-second-model-reviews-the-diff-in-bounded-rounds-and-the-pr-lists-what-it-raised-and-what-changed
artifact: testing
---

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

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-092` | `tests/work.review.test.ts` ("resolveReviewer: the first other configured model …") | Configured models in key order, each once; authors skipped by model id across kinds; no key skipped; null with no second model; no reviewer key read. |
| `REQ-plugins-092` | `tests/work.review.test.ts` ("reviewTree stages the work tree …") | The temp-index tree equals a full commit's; status and staged list unchanged. |
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
| `REQ-agent-092` | `tests/work.review.test.ts` ("a second call in the same batch as the findings is not run …") | The second call is held unrun; one review call; the cycle stays open. |
| `REQ-agent-117` | `tests/work.review.test.ts` ("delegate workers report their models and get the lead's authors") | `CORVIDINHO_DELEGATE_AUTHORS` from `authors`; worker models from the result frame. |
| `REQ-discord-088` | `tests/work.review.test.ts` ("/work: with no finished review …"), `tests/work.pr.test.ts` ("dirty verified worktree …", "GITHUB-6 default gate …") | `not-reviewed` line with the gate's reason and the branch pushed; with a finished review for the pushed tree /work commits, pushes and opens with the section. |
