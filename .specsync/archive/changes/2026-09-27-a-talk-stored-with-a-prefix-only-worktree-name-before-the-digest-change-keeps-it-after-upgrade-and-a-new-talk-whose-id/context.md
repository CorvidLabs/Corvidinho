---
change: a-talk-stored-with-a-prefix-only-worktree-name-before-the-digest-change-keeps-it-after-upgrade-and-a-new-talk-whose-id
artifact: context
---

# Context

Adversarial review of PR #206 (`store-memory-audit-1`), which appends a
sha256 digest of the full id to the default talk worktree id and `talk/`
branch name (REQ-discord-241). The fix itself was confirmed on current
`main`: two Discord-shaped ids that share their first 16 chars
(`sess_0123456789a11111` / `sess_0123456789a22222`) both mapped to
`talk-sess_0123456789a`, and the second `ensureTalkWorkspace` removed the
first talk's live worktree and its uncommitted file. With the digest they get
different dirs and the file survives.

Two gaps were left:

- REQ-discord-241 says names already stored on a session are used as given,
  but no test covered the upgrade path the digest change creates: a talk the
  old bridge stored with a prefix-only name (still `active`), and a new talk
  whose id shares that prefix. On old code the new talk's default name equals
  the stored path, so its setup force-removes the stored talk's worktree.
- `docs/discord.md` still documented the branch as `talk/{sessionPrefix}`.

No product code changes here: `src/worktree/manager.ts` stays as PR #206
left it. No new env var, slash command, table or column (schema stays v8).
