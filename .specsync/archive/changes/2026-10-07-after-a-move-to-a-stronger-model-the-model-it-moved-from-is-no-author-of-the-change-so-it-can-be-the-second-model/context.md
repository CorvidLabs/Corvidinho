---
change: after-a-move-to-a-stronger-model-the-model-it-moved-from-is-no-author-of-the-change-so-it-can-be-the-second-model
artifact: context
---

# Context

Post-merge review of PR #370 (AGENT-17 / AGENT-17.a: after the nudge a
stalled run moves to the next stronger model in `CORVIDINHO_LLM_MODEL_ORDER`)
found, and an independent refuter confirmed, that the model a run moved
from stays one of the change's authors (GITHUB-9.a).

Cause: `createTaskExecute`'s `onModel` hook (`src/agent/execute.ts`) adds
every model that answered to the run's `authors`, including the weak model
whose replies were only a plan or a "Done." claim, and the `escalate` hook
never removed it. On the stronger model's first change, the state-change
hook ran `recordAuthors`, writing `[...authors]` to `pr_change_authors`, so
that checkout and branch kept the weak model as an author for later runs
too. `resolveReviewer` (`src/work/review.ts`) skips every author.

Probe on origin/main: `CORVIDINHO_LLM_MODEL=fake-weak,fake-strong`, the same
order; the weak model says "Done." twice, the strong one touches README.md:
`exec.review.authors()` was `["fake-weak","fake-strong"]` and
`resolveReviewer` was null — no second model, so no PR. README tells owners
to configure at least two models, so this minimal setup is common.

Why removing it is safe: a move only happens when `nothingChanged()` held
for the whole run (no changed result in any attempt, no unreported-edit
tool, an empty real diff), so the weak model wrote none of the diff and no
`changedState` result has run `recordAuthors` yet.

Review follow-up (same PR): `recordAuthors` also ran after every `delegate`
call, including one refused before any worker ran (no `data`), which
AGENT-17 does not count as a change. A weak model that made such a call and
then said "Done." twice was written to `pr_change_authors` before the move,
so the gate still found no second model. The state-change hook now records
only after a call AGENT-17 counts as a change (a `changedState` result, or a
call whose edits no result reports, the same predicate the stall guard
uses), so a move implies nothing was recorded yet (REQ-agent-092).

Known residual, not changed here: a delegate worker that itself moves still
reports the model it moved from in `data.models` (its `usageByModel`), so
its lead counts that model as an author (fail-closed: no PR, and the reply
says why). Telling the lead which model a worker moved from would need a new
result-frame field.

Constraints: no new criteria, no hi capture; the lead's authors
(`CORVIDINHO_DELEGATE_AUTHORS`), a delegate worker's reported models and
every failover stay authors (`keptAuthors`); a later reply from the weak
model makes it an author again (`onModel`).
