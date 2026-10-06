---
change: on-github-the-owner-and-team-i-ve-declared-get-their-role-s-tools-behind-the-must-ask-gate-strangers-stay-community
artifact: requirements
---

# Requirements

- IDENTITY-12.a (captured in this PR, `hi/identity.md`, Leif 2026-09-28
  interview round 16): "On GitHub, the owner and team members I've declared
  get their role's tools too, behind the same must-ask gate; anyone else
  stays community."
- Builds on (on main): IDENTITY-9 "The owner can use everything, subject to
  the must-ask list.", IDENTITY-10 "Team members get work tasks, reviews, and
  only their own memory and briefings.", IDENTITY-12 "The role is checked in
  the tool layer on every run and surface; anyone undeclared is community at
  most.", IDENTITY-13/14 (declared people, recognised on GitHub),
  IDENTITY-7 / 7.a (numeric GitHub id only), AUTONOMY-9/10 + SAFE-18/20 (the
  must-ask card).
- Kept: SAFE-3.a (no shell, runners or Fledge runs on WATCH), SAFE-12 (the
  thread's text is fenced untrusted data), SAFE-13 (owner exemption by id),
  MEMORY-7 / 7.a / 8 (no private reads on GitHub, project memory read-only
  there), AGENT-18.a (WATCH never approves or archives a change), ALLOW-1/2
  (event repo and user allowlists before any run), GITHUB-6 (repo gates per
  role).
- Added: REQ-watch-1201 (the trigger's role, the spawn stamp, the role line),
  REQ-plugins-1201 (the tool layer on a WATCH run; never a /work task there;
  secret paths hidden on GitHub for every role), REQ-agent-1201 (no
  discovered Fledge plugin command in a WATCH run, even the owner's — SAFE-3.a
  keeps runs of project code off WATCH). Modified: REQ-watch-008
  (the ADMIN bit is the trigger's, not always 0), REQ-plugins-065 (WATCH is
  no longer always community; the role env keys are set by the Discord and
  WATCH spawn clients).
- No env var, config key, flag, NDJSON field, protocol, table or schema
  change.
