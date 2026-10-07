---
id: on-github-a-text-someone-else-edited-never-gets-its-author-s-role-the-safe-13-owner-exemption-covers-only-text-the
state: approved
type: bug_fix
base_commit: 86d68cd0d65e1836475d5e37a49444bdd0177ecb
---

# On GitHub, a text someone else edited never gets its author's role, the SAFE-13 owner exemption covers only text the owner wrote, a WATCH run never writes the watcher's own checkout, and its audit rows name its GitHub trigger (IDENTITY-12.a follow-up to #374)

## Intent

On GitHub, a text someone else edited never gets its author's role, the SAFE-13 owner exemption covers only text the owner wrote, a WATCH run never writes the watcher's own checkout, and its audit rows name its GitHub trigger (IDENTITY-12.a follow-up to #374)

## Affected Canonical Specs

- `watch`
- `plugins`

## Acceptance Criteria

- IDENTITY-12.a ('On GitHub, the owner and team members I've declared get their role's tools too, behind the same must-ask gate; anyone else stays community.'), follow-up to #374. (1) REQ-watch-1202: a WATCH comment or issue/PR-body event carries textEditorIds (the GitHub numeric ids of everyone who edited the triggering text after it was posted: [] when a comment's updated_at is its created_at, else read from GraphQL lastEditedAt/editor/userContentEdits; unreadable = absent) and threadAuthorId; watchTriggerRole gives owner/team only when every editor is the sender, else community (fail closed), and the identity block says the run has community tools; SAFE-13 exempts only text the owner wrote (the body when the owner sent it and nobody else edited it, the title when the owner opened the thread). (2) REQ-plugins-1202: on a WATCH run (surface watch or a WATCH session id) runPlugin refuses files-write/edit/delete, git-branch-create/commit/push and specsync-change-new/answer/approve/finalize for every role, the owner's included, so the watcher's own checkout is never written. (3) REQ-plugins-1203: auditContextFromEnv gives a WATCH run with no Discord actor the actor github:<CORVIDINHO_ACTING_GITHUB_ID> (else github:<login>, else github:(unknown)), never local, so SAFE-5 rows and must-ask requester/earlier-denial keys name the GitHub trigger. tests/watch.github-roles.postreview.test.ts fails on the base sources (11 of 12; per finding by swapping each file) and passes on the branch.

## No-spec Rationale

Not applicable
