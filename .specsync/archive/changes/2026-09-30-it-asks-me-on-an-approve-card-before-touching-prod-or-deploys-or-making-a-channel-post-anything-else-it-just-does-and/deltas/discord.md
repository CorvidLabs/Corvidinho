---
module: discord
change: it-asks-me-on-an-approve-card-before-touching-prod-or-deploys-or-making-a-channel-post-anything-else-it-just-does-and
---

# Delta: discord (the bridge's card engine answers the must-ask cards; every channel post waits for the owner's OK — AUTONOMY-9.a, AUTONOMY-10/10.a)

## Added

### REQUIREMENT REQ-discord-097

Every channel post it makes waits for my OK, even text I dictated and replies
to me (AUTONOMY-10.a, captured with `hi` in this change from Leif's
2026-09-30 round 13 decision; the channel-post half — the first-20
public-thread replies half is a later change), and every prod card needs the
one-time code (AUTONOMY-9.a). `src/discord/approval-cards.ts` SHALL export
`mustAskApprovalKinds({ db, now? })`: two `storedApprovalKind` kinds over
`approval_requests` — `mustask` (class destructive: Approve, then the SAFE-19
one-time code) and `mustask-post` (class plain: one Approve press) — whose
Approve only records the decision for the waiting run to consume once
(REQ-plugins-097), `nothingDone` "nothing was done", and whose request is
closed as a no when its waiting process is gone. The bridge SHALL register
both on its one engine beside the forget kind, so the cards are DMed to the
owner on the engine's ~5 s poll (with or without the scheduler), the text or
command first as quoted data, and answered by the owner only (SAFE-18..20).
`discord-post-message` SHALL raise the `mustask-post` card for every post
(target `Discord channel <id>`, text exactly the defanged body it posts,
at most 1900 characters) before its DISCORD-8 requester lookup; its channel
gate, requester-flag, token and strict-mode checks (`preparePost`, shared
with the handler) run first, so a post they refuse raises no card, and a
dry run (`CORVIDINHO_DISCORD_DRY_RUN=1`) raises none. No env var, config key
or schema change.

Acceptance Criteria
- `mustAskApprovalKinds` gives `mustask` (destructive) and `mustask-post` (plain); on the engine a prod card's text goes out first as quoted data, Approve alone runs nothing and Approve plus the code runs the waiting call once; a post card needs one press, and Deny runs nothing.
- A real `discord-post-message` post waits for the card and posts exactly the text the card showed; a refused post (channel, requester flag, token, strict) and a dry run raise no card.
