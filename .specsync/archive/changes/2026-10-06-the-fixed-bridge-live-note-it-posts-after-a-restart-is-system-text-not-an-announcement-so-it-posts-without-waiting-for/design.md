---
change: the-fixed-bridge-live-note-it-posts-after-a-restart-is-system-text-not-an-announcement-so-it-posts-without-waiting-for
artifact: design
---

# Design

- **No runtime change.** `startBridge`'s `onReady` (src/discord/bridge.ts)
  already posts `formatBridgeLiveAnnouncement(version)` straight through
  `postAnnouncement` to the announcements channel. The must-ask gate sits in
  `runPlugin` and only plugin calls reach it; the public-thread reply gate
  (`createPublicReplyGate`) is called only at the bridge's model-text post
  sites (chat answers, asks, slash answers, schedule results). The note
  reaches neither, so it already posts with no card.
- **Model-free by construction.** The note's only input is `version`
  (`opts.version ?? PACKAGE_VERSION`; production passes none), and
  `formatBridgeLiveAnnouncement` echoes it only when it is a plain `X.Y.Z`
  (else the fixed Releases-page note). No agent call is made for it. Nothing
  model-written can reach it, so nothing needed gating.
- **Comments** in `src/discord/announce.ts` (module header) and the
  `onReady` block in `bridge.ts` cite AUTONOMY-10.b, so a later change does
  not route the note through a card by mistake, and say to keep it
  model-free.
- **Tests pin it.** `tests/discord.update-post.test.ts` gains an
  AUTONOMY-10.b block: through `startBridge` with an owner, a gateway that
  says every channel is a public thread, a fast card engine and a model-text
  agent, the note posts at once on each of two restarts with no card, DM,
  hold line, count or agent call; hostile version text is never echoed; a
  `discord-post-message` of the same words still asks; and the docs line
  cites the captured id. The existing `bridgeWithAnnounce` helper gains
  optional `db`, `agent`, `publicThreads` and `dms` and a 5 ms card poll
  (the earlier tests are unchanged in what they assert).
- **Conservative choices** (pending Leif): the exemption covers only the
  bridge's own fixed note — the model posting the same words still asks; the
  note still posts even if the announcements channel is a public thread, and
  never counts toward the 20 approvals; the other fixed-text posts (OPS-1
  backup-failure notice, SAFE-15 spend warnings) stay as they were, not
  captured by AUTONOMY-10.b.
