---
change: on-github-a-text-someone-else-edited-never-gets-its-author-s-role-the-safe-13-owner-exemption-covers-only-text-the
artifact: context
---

# Context

- #374 (IDENTITY-12.a, merged as c0ad252) gave WATCH runs the declared role of
  the person who triggered them. A post-merge review found four defects, each
  confirmed by an independent refuter:
  1. (blocker) The role came from the triggering text's **original author**
     (`c.user` / `item.user`), but GitHub keeps that author when someone
     with write access (or an Actions / App token) edits the comment or body.
     Editing an owner's old comment to add "@<watch user> …" gave an
     owner-tools run to whoever edited it; `listComments` even asks for
     comments *updated* in the window. SAFE-13 was skipped for the "owner".
  2. (major) Owner WATCH runs could `files-write` / `files-edit` /
     `git-commit` in the watcher's own checkout (`task run --here`), which
     is also where every WATCH, Discord and daemon spawn runs `src/cli.ts`
     from; no per-run worktree on GitHub.
  3. (major) The SAFE-13 owner exemption skipped the whole event text, so a
     stranger's injected thread title rode into an owner-tools run when the
     owner commented on it.
  4. (major) WATCH tool calls were audited (SAFE-5) and keyed for must-ask
     denials as actor `local`, the same as the operator's CLI.
- #374's own design listed 2 and 4 as risks.
- Criterion: IDENTITY-12.a "On GitHub, the owner and team members I've
  declared get their role's tools too, behind the same must-ask gate; anyone
  else stays community." (with IDENTITY-9/10/12). No new criterion, no hi
  capture.
