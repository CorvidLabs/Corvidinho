---
id: shell-exec-refuses-specsync-change-approve-review-finalize-and-ship-in-every-repo-only-a-human-or-corvidinho-s-own
state: approved
type: feature
base_commit: e1a24ed25f0368293f52f056a3483b62a9e14756
---

# Shell-exec refuses specsync change approve, review, finalize and ship in every repo: only a human, or Corvidinho's own green-lane settle, does them (AGENT-18.a)

## Intent

Shell-exec refuses specsync change approve, review, finalize and ship in every repo: only a human, or Corvidinho's own green-lane settle, does them (AGENT-18.a)

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- AGENT-18.a (captured on main, hi/agent.md, from Leif's 2026-09-28 interview round 13: 'On Corvidinho it may approve and archive its own SpecSync change once verify is green; in other repos a human approves, reviews and finalizes.'): shell-exec refuses specsync change approve|review|finalize|ship <id> with exit 2, spawning nothing, in every repo and with no repo check (synchronous); the refusal names AGENT-18.a and reuses HUMAN_LIFECYCLE_LINE; the change's state.json is unchanged, no approvals.json or review.json is written and nothing moves to .specsync/archive. The same holds through sh -c / bash -c, eval, $(…) and backticks, the env / timeout / nohup / xargs / sudo / exec / find -exec wrappers, an absolute or relative path to the binary (basename) or a link to it, bunx / npx specsync, SpecSync's own options before the step, a step that expands or that xargs fills in from input, and an in-root script run with sh x.sh, . ./x.sh or ./x.sh (one walker with SAFE-21: forEachSimpleCommand / commandChain). AUTONOMY-9 raises no Approve card for such a command. runTask's settle after a green lane still approves and archives the run's own change on Corvidinho through the SpecSync plugin, which spawns specsync directly (tests/agent.repo-ways.test.ts unchanged and green). Read-only specsync change status|list|show|check|ship-status and specsync check still run. The spec states the residual: code an interpreter runs (bun -e, node -e, python -c, node-exec / python-exec / cargo-exec) that spawns specsync itself is not parsed, nor are package-manager scripts, make / just recipes, git aliases or a renamed copy of the binary. No new command, env var, flag or config key. tests/shell.sdd-lifecycle.test.ts fails on the base sources and passes on the branch.

## No-spec Rationale

Not applicable
