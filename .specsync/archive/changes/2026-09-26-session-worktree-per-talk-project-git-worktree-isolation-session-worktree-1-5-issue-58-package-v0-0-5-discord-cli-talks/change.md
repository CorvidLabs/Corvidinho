---
id: session-worktree-per-talk-project-git-worktree-isolation-session-worktree-1-5-issue-58-package-v0-0-5-discord-cli-talks
state: archived
type: feature
base_commit: 6cb5f18ab909f4bc5e6529b8c29df121e0833c4e
---

# SESSION-WORKTREE per-talk/project git worktree isolation (SESSION-WORKTREE-1..5 / issue #58) + package v0.0.5: Discord/CLI talks and scheduled runs get isolated git worktrees so cwd/branch do not bleed; steal corvid-agent worktree lib Linux headless; soft TTL still applies; end/abandon parks or cleans; explicit project per talk/schedule never silent mid-conversation switch; wire session/work spawn + schedule ticks; fixture tests; SpecSync+fledge verify

## Intent

SESSION-WORKTREE per-talk/project git worktree isolation (SESSION-WORKTREE-1..5 / issue #58) + package v0.0.5: Discord/CLI talks and scheduled runs get isolated git worktrees so cwd/branch do not bleed; steal corvid-agent worktree lib Linux headless; soft TTL still applies; end/abandon parks or cleans; explicit project per talk/schedule never silent mid-conversation switch; wire session/work spawn + schedule ticks; fixture tests; SpecSync+fledge verify

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- Discord/CLI talks that do repo work and scheduled runs on project X each get an isolated git worktree (or project-scoped dir) under WORKTREE_BASE_DIR/.corvid-worktrees so cwd/branch do not bleed across concurrent talks (SESSION-WORKTREE-1/5); soft TTL/new-topic SESSION-1..3 still apply and isolation does not replace MEMORY (SESSION-WORKTREE-2); end/abandon/TTL purge parks or removes the worktree so another talk never silently reuses it as cwd (SESSION-WORKTREE-3); project is explicit per talk/schedule and never silently switches mid-conversation (SESSION-WORKTREE-4); schedule ticks use that project's worktree/scope; package bumped to 0.0.5; fixture tests + SpecSync + fledge verify green; no new slash commands; no ProcessManager; Linux headless only

## No-spec Rationale

Not applicable
