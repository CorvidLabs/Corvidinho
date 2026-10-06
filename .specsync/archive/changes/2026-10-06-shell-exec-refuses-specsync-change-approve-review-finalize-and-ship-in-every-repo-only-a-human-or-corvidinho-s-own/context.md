---
change: shell-exec-refuses-specsync-change-approve-review-finalize-and-ship-in-every-repo-only-a-human-or-corvidinho-s-own
artifact: context
---

# Context

Tracked under issue #89 (M3 "Real dev teammate"). AGENT-18.a is captured on
main (`hi/agent.md`, from Leif's 2026-09-28 interview, round 13): "On
Corvidinho it may approve and archive its own SpecSync change once verify is
green; in other repos a human approves, reviews and finalizes." #329 built
it for the SpecSync tools: `specsync-change-approve` / `-finalize` are never
offered to the model and refuse with `selfLifecycleRefusal` /
`HUMAN_LIFECYCLE_LINE` unless `runTask` is settling the run's own change on
Corvidinho right after a green lane. Nothing new is captured here.

What was wrong on main (e1a24ed2; the shell code is the same at 8bf4422, where the W13 audit found it), found by the W13 re-audit and checked
adversarially: owner-tier `shell-exec` in the owner's talk worktree
(SAFE-3.a, any repo) keeps `PATH` and has no SpecSync lifecycle check, so the
model could run `specsync change approve <id> --actor <anything>`,
`specsync change review <id> --reviewer <anything>` or
`specsync change finalize|ship <id>` in any repo. Only a prompt line
("Never approve, review or finalize a change yourself") stood against it;
the file tools already refuse `.specsync/changes/<id>/*.json`
(`plugins/files/protectedPaths.ts`), but the shell does not go through them,
and `sddUncovered` counts a change archived in the run's own diff as
covering its paths.

Constraints: specs only through SpecSync; #232/#233 scope untouched; a
parallel build (SAFE-4 store guard) comes after this one and also edits
`plugins/shell`, so the check lives in its own module
(`plugins/shell/sdd-lifecycle.ts`) and the shared files get a few lines each.
No new command, env var, flag or config key.
