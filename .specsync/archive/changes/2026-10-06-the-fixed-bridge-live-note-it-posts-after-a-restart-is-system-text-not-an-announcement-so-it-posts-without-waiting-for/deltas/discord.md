---
module: discord
change: the-fixed-bridge-live-note-it-posts-after-a-restart-is-system-text-not-an-announcement-so-it-posts-without-waiting-for
---

# Delta — discord (the bridge-live note is system text and posts without the owner's OK, AUTONOMY-10.b)

## Modified

### REQUIREMENT REQ-discord-024

(Clarify bridge-live content only.) After every successful bridge restart
(`ClientReady`), when configured, Corvidinho SHALL post the update note from
`formatBridgeLiveAnnouncement` (REQ-discord-025) via `postAnnouncement`
— never to the general allowlisted chat by default (DISCORD-ANNOUNCE-4). The
note SHALL be one short line in the persona's voice naming the running version
with a link to that version's release notes (PERSONA-1.a), posted as one
message; it SHALL NOT carry CHANGELOG bullets (the bare `bridge live vX.Y.Z`
header and the ≤5 CHANGELOG bullets of package 0.0.11 are replaced). Package
version history for `/announce` slash itself remains **0.0.8**; the bullets
shipped in **0.0.11**.

The fixed 'bridge is live' note it posts after a restart is system text, not
an announcement, so it doesn't wait for my OK (AUTONOMY-10.b, captured with
`hi` in this change from Leif's 2026-09-28 interview, round 16 decision):

- The bridge SHALL post the note at `ClientReady` straight through
  `postAnnouncement` with no Approve card: no `approval_requests` row, no DM
  to the owner, no hold line and no wait — with an owner configured, and even
  when the gateway reports the announcements channel as a public thread. The
  public-thread reply gate (REQ-discord-099) SHALL NOT hold it, and it SHALL
  NOT count toward the 20 approved public-thread replies
  (`public_thread_replies_approved`).
- The note SHALL stay model-free: no model call or agent run is made for it,
  and it SHALL be exactly the fixed REQ-discord-025 template for the running
  version; text that is not a plain release version (model-looking text
  included) passed as the version is never echoed.
- The exemption SHALL cover only the bridge's own fixed note: a
  `discord-post-message` carrying the same words still waits for the owner's
  plain `mustask-post` card (AUTONOMY-10.a, REQ-discord-097 /
  REQ-plugins-097).
- `docs/discord.md`'s must-ask list SHALL name the bridge-live note as system
  text that needs no card, citing AUTONOMY-10.b. No env var, config key,
  slash command, table or schema change; DISCORD-ANNOUNCE-4 is unchanged.

Acceptance Criteria
- ClientReady posts bridge-live note only to announce channel (not dogfood allowlist).
- Note content matches REQ-discord-025 (one in-voice line with the version and the release notes link; no bullets).
- `/announce` slash + persist behavior from REQ-discord-024 otherwise unchanged.
- Through `startBridge`, one ClientReady gives exactly one post, to the announcements channel, pinging nobody; with no announcements channel nothing is posted.
- With an owner configured and every channel reported as a public thread, each of two restarts on the same DB posts exactly the fixed template once to the announcements channel, records no `approval_requests` row, DMs nobody, posts no hold line, leaves the approved public-thread count at 0 and calls no agent (AUTONOMY-10.b).
- A version passed as `1.0.0` plus model-looking text gives the fixed Releases-page note with none of that text, and no agent call; the running build's own note matches the fixed template.
- A `discord-post-message` with exactly the note's text raises one `mustask-post` card showing that text, and a deny refuses it (`refused (AUTONOMY-10)`).
- `docs/discord.md`'s must-ask "Not on the list" line names the bridge-live note and cites AUTONOMY-10.b, and `hi/autonomy.md` holds that criterion; this case fails on the base sources and passes on the branch.
