---
change: it-asks-me-on-an-approve-card-before-touching-prod-or-deploys-or-making-a-channel-post-anything-else-it-just-does-and
artifact: docs
---

# Docs

- `docs/discord.md`: new "The must-ask list (AUTONOMY-9..11, #97)" section
  (policy table, what is not on the list, the self-update exemption, waiting,
  no is no, where no card is raised); the Approve / Deny cards intro names the
  must-ask kinds; the `discord-post-message` paragraph says every post waits
  for the card and which checks run first.
- `docs/DISCORD-GO-LIVE.md`: an operator bullet for the must-ask cards (bridge
  running + owner configured; nothing else to set) and the
  `discord-post-message` allowlist row says every post waits for the card.
- Specs: `specs/plugins/plugins.spec.md` (files, Purpose, Public API, the
  must-ask invariant, the git-push note), `specs/discord/discord.spec.md`
  (`mustAskApprovalKinds`, the post invariant), `specs/agent/agent.spec.md`
  (the AUTONOMY-11 sentence), `specs/cli/cli.spec.md` (the notes on the event
  stream), and each module's `testing.md`.
- `hi/autonomy.md` + `INTENT.md`: AUTONOMY-9.a and AUTONOMY-10.a captured with
  `hi`.
