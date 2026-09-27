/**
 * Processed-id dedup for WATCH poll cycles.
 *
 * REQ-watch-247: with a db, handled ids persist per kind in the shared
 * Corvidinho DB (`watch_event_ids`), so a restart never replays an event the
 * watcher already handled (at most once per event id). Without a db the store
 * is in-memory with a FIFO cap (tests, injected session store).
 */

import type { Database } from "bun:sqlite";
import type { DetectedEvent } from "./types.ts";

/** Return events whose ids are not in processedIds. */
export function filterNewEvents(
  events: DetectedEvent[],
  processedIds: Iterable<string>,
): DetectedEvent[] {
  const seen = new Set(
    [...processedIds].map((id) => id.toLowerCase()),
  );
  return events.filter((e) => !seen.has(e.id.toLowerCase()));
}

/** Keep newest event per repo#number (events expected newest-first). */
export function dedupeByIssue(events: DetectedEvent[]): DetectedEvent[] {
  const seen = new Set<string>();
  const out: DetectedEvent[] = [];
  for (const e of events) {
    const key = `${e.repo.toLowerCase()}#${e.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/** Which WATCH dedup set an id belongs to (one row namespace each). */
export type WatchIdKind = "processed" | "acked" | "summarized";

export type IdStoreOptions = {
  /** Persist ids in the shared Corvidinho DB (`watch_event_ids`). */
  db?: Database;
  /** In-memory FIFO cap when there is no db. Default 2000. */
  maxSize?: number;
};

/**
 * Created on first use with IF NOT EXISTS, so no schema version bump. Rows
 * hold event ids only (`comment-<n>`, `issue-owner/repo#n`, ...), never text.
 */
function ensureWatchEventIdsTable(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS watch_event_ids (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (kind, id)
)`);
}

export class ProcessedIdStore {
  private ids = new Set<string>();
  private readonly maxSize: number;
  private readonly db: Database | undefined;
  private readonly kind: WatchIdKind;

  constructor(
    opts: number | IdStoreOptions = {},
    kind: WatchIdKind = "processed",
  ) {
    const o = typeof opts === "number" ? { maxSize: opts } : opts;
    this.maxSize = o.maxSize ?? 2000;
    this.db = o.db;
    this.kind = kind;
    if (this.db) ensureWatchEventIdsTable(this.db);
  }

  /** True when ids persist in SQLite (no FIFO eviction). */
  get durable(): boolean {
    return this.db !== undefined;
  }

  has(id: string): boolean {
    const key = id.toLowerCase();
    if (this.db) {
      return (
        this.db
          .query("SELECT 1 FROM watch_event_ids WHERE kind = ? AND id = ?")
          .get(this.kind, key) !== null
      );
    }
    return this.ids.has(key);
  }

  add(id: string): void {
    const key = id.toLowerCase();
    if (this.db) {
      this.db.run(
        "INSERT OR IGNORE INTO watch_event_ids (kind, id, seen_at) VALUES (?, ?, ?)",
        [this.kind, key, Date.now()],
      );
      return;
    }
    this.ids.add(key);
    if (this.ids.size > this.maxSize) {
      const first = this.ids.values().next().value;
      if (first !== undefined) this.ids.delete(first);
    }
  }

  addMany(ids: string[]): void {
    const db = this.db;
    if (db) {
      db.transaction(() => {
        for (const id of ids) this.add(id);
      })();
      return;
    }
    for (const id of ids) this.add(id);
  }

  list(): string[] {
    if (this.db) {
      const rows = this.db
        .query(
          "SELECT id FROM watch_event_ids WHERE kind = ? ORDER BY seen_at, rowid",
        )
        .all(this.kind) as Array<{ id: string }>;
      return rows.map((r) => r.id);
    }
    return [...this.ids];
  }
}
