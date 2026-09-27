---
change: task-run-offers-allowlisted-dangerous-tools-to-the-model-a-dangerous-plugin-enters-the-catalog-only-when-corvidinho
artifact: requirements
---

# Requirements

- REQ-agent-501 (added): the task-run catalog offers a dangerous plugin only
  when the run's allowlist names it; never `shell-exec`, `node-exec`,
  `python-exec`, `cargo-exec` (SAFE-3 pending); tier, role (ROLES-CHAT-2),
  SAFE-9 filters and every runtime gate unchanged; empty allowlist = the old
  catalog. HI: CLI-3, SAFE-1, GITHUB-1/3, ROLES-CHAT-4, PLUGIN-3.
- REQ-agent-502 (added): a non-git run (or unreadable start snapshot) that
  called a tool whose edits no result reports (a Fledge command, the shell or
  a runner) runs verify anyway, with a Text note; so does a local run's
  `delegate` call when the allowlist names a `fledge-*` command (its worker
  could have run it); other non-git runs are unchanged. HI: AGENT-4.
- REQ-agent-009 (modified): "the default catalog SHALL omit dangerous
  plugins" becomes "... the run's allowlist does not name"; new acceptance
  bullet for the empty allowlist and the tier filter.
- REQ-agent-128 (modified): statement unchanged; new acceptance bullet: an
  unlisted `danger-ping` (interactive) and an allowlisted `shell-exec` are
  refused as not offered.
- REQ-agent-112 (modified): Fledge plugins also load when the allowlist names
  a `fledge-*` command and the session is not a non-ADMIN role session; no
  fledge spawn otherwise; three new bullets.
- REQ-agent-085 (modified): the non-git "tool-reported files only" sentence
  gains the REQ-agent-502 exception; one new bullet.

Unchanged: REQ-agent-roles-001 (non-ADMIN catalog), REQ-agent-117 (SAFE-9),
REQ-agent-008 (tool loop), REQ-plugins SAFE-1 / SAFE-4 / SAFE-5 / GITHUB-6
runtime gates.
