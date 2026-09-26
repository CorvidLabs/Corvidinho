---
change: backfill-changelog-0-0-9-0-0-10-notes-owner-only-admin-upgrade-note-136-138-141-under-0-0-9-protocol-2-restart-note-139
artifact: context
---

# Context

The v0.0.9 and v0.0.10 tags were cut by a parallel worker from builds that already contained #136/#138/#141 (v0.0.9) and #139/#143 (v0.0.10), but their CHANGELOG sections did not mention them — including two operator-facing upgrade steps (set the owner before deploying owner-only ADMIN; restart bridge + watch + binary together for protocol 2). This backfills the notes so the updater's changelog extraction and readers see them.
