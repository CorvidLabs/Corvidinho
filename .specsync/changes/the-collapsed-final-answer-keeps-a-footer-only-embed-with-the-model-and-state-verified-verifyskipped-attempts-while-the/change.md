---
id: the-collapsed-final-answer-keeps-a-footer-only-embed-with-the-model-and-state-verified-verifyskipped-attempts-while-the
state: implementing
type: bug_fix
base_commit: 0940db343de30fdb4d79d83cfa44b95c5a247681
---

# The collapsed final answer keeps a footer-only embed with the model and state/verified/verifySkipped/attempts, while the Choose stub stays embed-free (DISCORD-3.a)

## Intent

The collapsed final answer keeps a footer-only embed with the model and state/verified/verifySkipped/attempts, while the Choose stub stays embed-free (DISCORD-3.a)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- When the thinking message is edited into the final answer (an @mention reply, the answer to a run a button pick resumed, /session start and /work), the edit keeps one footer-only embed (no description) whose footer is the model and the run's plumbing (state=… verified=… [verifySkipped] [cancelled] attempts=…), success-colored or error-colored exactly when the fallback status would be done or fail, and the answer body stays human text with no plumbing; a Choose stub (the edit that carries buttons) still has no embed; an append re-edit (SAFE-8 owner notice) keeps the footer; with neither model nor plumbing known no embed is sent; tests fail on the previous code (embed null on every collapse) and pass after

## No-spec Rationale

Not applicable
