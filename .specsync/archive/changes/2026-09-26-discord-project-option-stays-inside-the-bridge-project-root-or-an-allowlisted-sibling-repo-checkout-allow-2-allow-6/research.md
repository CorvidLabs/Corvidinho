---
change: discord-project-option-stays-inside-the-bridge-project-root-or-an-allowlisted-sibling-repo-checkout-allow-2-allow-6
artifact: research
---

# Research

`work.ts` and `session.ts` pass the trimmed option to
`SessionStore.createWithWorktree`; `resolveProjectDir` tried
`resolve(root, raw)` then `resolve(dirname(root), raw)` and returned the first
existing directory. `ensureTalkWorkspace` then ran `git worktree add` in it.
`SchedulerService.runOne` used the same resolver; `/schedule create` stored the
raw string. The GitHub allowlist gate (`isRepoAllowed`) and the remote parser
(`repoSlugFromRemoteUrl`) already exist and are reused.
