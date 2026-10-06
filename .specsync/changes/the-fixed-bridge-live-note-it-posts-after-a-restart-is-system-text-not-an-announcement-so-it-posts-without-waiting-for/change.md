---
id: the-fixed-bridge-live-note-it-posts-after-a-restart-is-system-text-not-an-announcement-so-it-posts-without-waiting-for
state: implementing
type: feature
base_commit: 4569a5095dce48afca0379b9c36549787bf4f1de
---

# The fixed bridge-live note it posts after a restart is system text, not an announcement, so it posts without waiting for the owner's OK (AUTONOMY-10.b, #124)

## Intent

The fixed bridge-live note it posts after a restart is system text, not an announcement, so it posts without waiting for the owner's OK (AUTONOMY-10.b, #124)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- AUTONOMY-10.b (captured with hi in this PR from Leif's 2026-09-28 interview, round 16 decision): "The fixed 'bridge is live' note it posts after a restart is system text, not an announcement, so it doesn't wait for my OK." Holds for this PR's scope: after every successful bridge restart (ClientReady) the bridge posts the fixed bridge-live note (formatBridgeLiveAnnouncement, REQ-discord-025) straight to the configured announcements channel only (DISCORD-ANNOUNCE-4 unchanged) with no Approve card — no approval_requests row, no DM to the owner, no hold line, no wait — even with an owner configured and an announcements channel the gateway reports as a public thread, and it never counts toward the 20 public-thread approvals (AUTONOMY-10.a unchanged for model text). The note stays model-free: no model call is made for it and it is exactly the fixed template for the running version (a version that is not a plain X.Y.Z, model-looking text included, is never echoed). The exemption covers only the bridge's own fixed note: a discord-post-message carrying the same words still waits for the owner's card (AUTONOMY-10.a). docs/discord.md's must-ask list cites AUTONOMY-10.b for the bridge-live note; REQ-discord-024 (Modified) states it. tests/discord.update-post.test.ts proves it; its AUTONOMY-10.b doc/hi citation case fails on the base sources and passes on the branch.

## No-spec Rationale

Not applicable
