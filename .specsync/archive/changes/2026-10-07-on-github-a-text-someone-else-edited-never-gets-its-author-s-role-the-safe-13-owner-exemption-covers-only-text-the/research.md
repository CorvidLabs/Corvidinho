---
change: on-github-a-text-someone-else-edited-never-gets-its-author-s-role-the-safe-13-owner-exemption-covers-only-text-the
artifact: research
---

# Research

- `src/watch/searcher.ts`: comment events take `sender` / `senderId` from
  `c.user`; body events from `item.user`; `listComments` passes `since`
  (comments *updated* since) and dropped `updated_at` and `node_id`.
- GitHub REST: an issue comment's `updated_at` equals `created_at` until it
  is edited; REST never says who edited a comment or a body. GraphQL
  `Comment` (implemented by `Issue`, `PullRequest`, `IssueComment`)
  has `lastEditedAt`, `editor` and `userContentEdits` (each revision's
  `editor` and `deletedBy`); REST `node_id` is the GraphQL id.
  `@octokit/rest` already carries `octokit.graphql`.
- `src/watch/router.ts`: `watchTriggerRole` resolved `senderId`;
  `watchInjectionVerdict` returned null for an owner sender before scanning
  `watchEventText` (title + body); a comment event's `title` is the
  thread's.
- `src/watch/agent-client.ts` / `src/worktree/cli-run.ts`: WATCH runs are
  `task run --here` in `config.projectRoot` (the watcher's cwd), never a
  worktree; the binary is `<projectRoot>/src/cli.ts`.
  `plugins/files/commands.ts`: `files-write` / `files-edit` are
  mutating, not dangerous, so no SAFE-1 allowlist entry is needed.
  `src/agent/shell-gate.ts` already keys WATCH on the surface stamp or
  `CORVIDINHO_WATCH_SESSION_ID`.
- `src/audit/log.ts` `auditContextFromEnv`: actor =
  `CORVIDINHO_ACTING_DISCORD_USER_ID` or `local`; the WATCH spawn clears the
  Discord actor; `src/plugins/must-ask.ts` uses the same actor as the card
  requester and the `deniedBefore` key; the denial hash excludes the card
  title (surface).
