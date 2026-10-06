---
change: the-fixed-bridge-live-note-it-posts-after-a-restart-is-system-text-not-an-announcement-so-it-posts-without-waiting-for
artifact: context
---

# Context

Tracked under issue #124 (M4 "Safe autonomy"). AUTONOMY-10 ("It asks
before announcements it starts and before its first 20 replies in public
threads; GitHub comments and social posts don't need asking.") and
AUTONOMY-10.a ("Every channel post it makes, and each of its first 20
public-thread replies, waits for my OK, even text I dictated and replies to
me.") are captured on main. The must-ask gate (#319, REQ-plugins-097 /
REQ-discord-097) and the public-thread reply gate (#341–#349,
REQ-discord-099) shipped them.

The bridge-live note (DISCORD-ANNOUNCE-4, PERSONA-1.a, REQ-discord-024/025)
was left off the must-ask list as a conservative default pending Leif
(`/home/user/coord/m34-defaults.md`: fixed-text system posts are not gated,
since they carry no model text and DISCORD-ANNOUNCE-4 requires the note to
post automatically). docs/discord.md said so ("Not on the list: … fixed-text
system posts (the bridge-live note, …)") with no criterion behind it.

Leif decided in his 2026-09-28 interview record, round 16 (answered
2026-10-06): "AUTONOMY-10 bridge-live note: **exempt** — the fixed 'bridge is
live' note after a restart is system text, posts without asking
(DISCORD-ANNOUNCE-4 unchanged)." This change captures that as AUTONOMY-10.b
with `hi` and records it in docs, spec and tests. Nothing in the bridge's
behaviour changes: on main (e1a24ed) `onReady` already posts the note
straight through `postAnnouncement`, never through the must-ask gate or
the public-thread reply gate, and the note is a fixed template with only a
validated version in it.

Constraints: specs only through SpecSync; v1 off-chain; #232/#233 scope
untouched; no env var, config key, schema or package version change.
