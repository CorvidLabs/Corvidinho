---
change: watch-durable-sessionstore-issue-37-slice-1-session-1-3-watch-sessions-keyed-by-owner-repo-number-persist-in-the-shared
artifact: docs
---

# Docs

`docs/WATCH.md`: WATCH sessions now persist in the shared SQLite DB
(`~/.local/share/corvidinho/corvidinho.db`, override `CORVIDINHO_DATA_DIR`) with
the same soft TTL as Discord (`CORVIDINHO_SESSION_TTL_MS`, 30–60m, default 45m).
Ops: a `github watch` restart keeps live issue sessions; issues idle past the
TTL start fresh. Dry-run without a data dir stays in-memory.
