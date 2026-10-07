---
change: on-github-a-text-someone-else-edited-never-gets-its-author-s-role-the-safe-13-owner-exemption-covers-only-text-the
artifact: design
---

# Design

- **Who edited the text, fail closed.** `DetectedEvent.textEditorIds` is the
  set of GitHub numeric ids that edited the triggering text, `[]` when never
  edited, absent when unknown. Every new mention comment and body asks
  `SearchClient.findTextEditors(node_id)` (optional on the interface: a
  client without it, or a lookup that fails, leaves the field absent); REST
  `updated_at` is never used, because it is to the second and an edit a bot
  makes in the second a comment was posted would look like none (review
  round). The poller's `needsLookup` skips ids it already processed or
  denied, so each new event costs one lookup once. The
  rule is "every editor is the sender" (stricter than "the last editor is the
  sender": an owner touching up a comment someone else changed does not
  launder the change); revision deleters count as editors, and a cut history
  (more than 100 revisions) is unknown. `textUneditedByOthers` is the one
  predicate both `watchTriggerRole` and `watchInjectionVerdict` use.
- **SAFE-13 scans what the owner did not write.** The body is exempt only when
  the owner sent it and `textUneditedByOthers` holds; the title only when
  `threadAuthorId` (the search item's `user.id`) is the owner's. The
  scanned text is `watchEventText` with the exempt parts blanked, so the
  refusal and audit paths are unchanged.
- **No checkout writes on WATCH (interim).** A per-thread worktree for WATCH
  runs is the full fix but new lifecycle (create, park, clean up). Until then
  `runPlugin` refuses `WATCH_CHECKOUT_WRITE_TOOLS` (file write / edit /
  delete, git branch / commit / push, the SpecSync change steps that write
  `.specsync/`) on any WATCH run, before the role gate, for every role. The
  check keys on the surface stamp or the WATCH session id (like
  `shellToolsGate`), so workers that inherit the session id are covered too.
  The tools stay in the catalog (the refusal names why), keeping the agent
  module and REQ-agent-1201 unchanged.
- **Audit actor.** `auditContextFromEnv` keeps a Discord actor first; on a
  WATCH session with none it is `github:<numeric id>`, else
  `github:<login>` (lowercased, validated), else `github:(unknown)`. The
  must-ask gate reads the same function, so cards and `deniedBefore` keys
  move with it.
- **Renamed titles (review round).** The owner's title is exempt only while
  nobody else renamed it: `titleEditorIds` is every `RenamedTitleEvent`
  actor on the thread (GraphQL `timelineItems(itemTypes:
  [RENAMED_TITLE_EVENT])`, aliased per Issue / PullRequest), read once per
  thread with a new event; unknown ⇒ the title is scanned.
- **Whom the run acts for (review round).** `watchActingGithub` is the one
  answer for memory, audit and must-ask: the sender of a text nobody else
  edited (login + id), an assignment's or review request's actor (login
  only, so no person's memory, IDENTITY-7.a), else nobody. The poller
  passes only that to `runChat` and to the memory inject, so an edit no
  longer reads, injects or saves the author's profile (MEMORY-ACL-1), and a
  "forget me" someone else edited raises no card (`edited` outcome).
- **Out of scope (noted, not changed):** replaying earlier turns through
  SAFE-13; gating the editors of a text against the GitHub user allowlist
  (an edit by a non-allowlisted writer still starts a community run that
  acts for nobody).
