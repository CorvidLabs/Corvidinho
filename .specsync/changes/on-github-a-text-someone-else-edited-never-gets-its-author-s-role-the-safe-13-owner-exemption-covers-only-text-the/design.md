---
change: on-github-a-text-someone-else-edited-never-gets-its-author-s-role-the-safe-13-owner-exemption-covers-only-text-the
artifact: design
---

# Design

- **Who edited the text, fail closed.** `DetectedEvent.textEditorIds` is the
  set of GitHub numeric ids that edited the triggering text, `[]` when never
  edited, absent when unknown. A comment whose `updated_at` equals
  `created_at` needs no lookup; any other comment and every body ask
  `SearchClient.findTextEditors(node_id)` (optional on the interface: a
  client without it, or a lookup that fails, leaves the field absent). The
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
- **Out of scope (noted, not changed):** replaying earlier turns through
  SAFE-13, a title renamed by a collaborator on an owner-opened thread, and
  the MEMORY-8 memory identity (memory inject and memory plugins still act
  for `senderId`) are separate follow-ups; none is in the four findings.
