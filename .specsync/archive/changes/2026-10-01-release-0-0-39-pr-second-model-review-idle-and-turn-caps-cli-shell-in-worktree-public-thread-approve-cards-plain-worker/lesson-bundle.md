# Lesson bundle — release-0-0-39-pr-second-model-review-idle-and-turn-caps-cli-shell-in-worktree-public-thread-approve-cards-plain-worker

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release 0.0.39: PR second-model review, idle and turn caps, CLI shell in worktree, public-thread approve cards, plain worker and WATCH failure lines
- **Kind**: Operations
- **Specs**: cli
- **Paths**: package.json, CHANGELOG.md, STATUS.md, tests/version.test.ts, tests/update-helpers.test.ts
- **Acceptance**: package.json 0.0.39; version prints 0.0.39; CHANGELOG 0.0.39 extractable; STATUS rows

## Evidence

- Verification commit: `32e5ee736e03837e4682ec8ff1513c19786cee5e`
- Base commit: `6ea722e17df07467737ce10d8949de85e4c04089`
- Verified by: `specsync check --spec cli`

## From the change's context.md

---
change: release-0-0-39-pr-second-model-review-idle-and-turn-caps-cli-shell-in-worktree-public-thread-approve-cards-plain-worker
artifact: context
---

# Context

Release 0.0.39: PR second-model review, idle and turn caps, CLI shell in worktree, public-thread approve cards, plain worker and WATCH failure lines

## From the change's design.md

---
change: release-0-0-39-pr-second-model-review-idle-and-turn-caps-cli-shell-in-worktree-public-thread-approve-cards-plain-worker
artifact: design
---

# Design

Version bump, CHANGELOG 0.0.39, STATUS rows, version + changelog-helper tests.

## From the change's testing.md

---
change: release-0-0-39-pr-second-model-review-idle-and-turn-caps-cli-shell-in-worktree-public-thread-approve-cards-plain-worker
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-431` | `tests/version.test.ts`, `tests/update-helpers.test.ts` | package + VERSION are 0.0.39; changelog helper extracts 0.0.39 exactly. |
