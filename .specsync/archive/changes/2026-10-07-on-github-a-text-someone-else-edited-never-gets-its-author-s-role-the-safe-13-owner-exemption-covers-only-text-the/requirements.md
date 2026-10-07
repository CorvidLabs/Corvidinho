---
change: on-github-a-text-someone-else-edited-never-gets-its-author-s-role-the-safe-13-owner-exemption-covers-only-text-the
artifact: requirements
---

# Requirements

- IDENTITY-12.a (on main, `hi/identity.md`): "On GitHub, the owner and team
  members I've declared get their role's tools too, behind the same must-ask
  gate; anyone else stays community." With IDENTITY-9/10/12 (role in the tool
  layer, undeclared is community at most), SAFE-5 (audit trail), SAFE-13
  (injection detector, owner exemption), SESSION-WORKTREE-1 (repo work runs
  in its own worktree), AUTONOMY-9/10 + SAFE-20 (must-ask cards and denials).
- Added: REQ-watch-1202 (who edited the triggering text; role and SAFE-13
  exemption only for text nobody else edited; title exempt only when the
  owner opened the thread), REQ-plugins-1202 (a WATCH run never runs the
  tools that write the watcher's own checkout), REQ-plugins-1203 (a WATCH
  run's audit actor and must-ask requester are its GitHub trigger).
- Modified (full text kept, one bullet each): REQ-watch-1201, REQ-watch-071,
  REQ-plugins-1201.
- No env var, config key, flag, NDJSON field, protocol, table or schema
  change.
