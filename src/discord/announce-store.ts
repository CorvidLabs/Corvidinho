/**
 * Persist the Discord announcements channel id (DISCORD-ANNOUNCE-1..6).
 * Shared SQLite `schema_meta` under corvidinho data dir — survives restarts.
 * Empty / missing = default-deny (no announce posts).
 */

import type { Database } from "bun:sqlite";

export const ANNOUNCE_CHANNEL_META_KEY = "discord_announce_channel_id";

export class AnnounceStore {
  constructor(private readonly db: Database) {}

  /** Current announcements channel snowflake, or null when not configured. */
  getChannelId(): string | null {
    const row = this.db
      .query("SELECT value FROM schema_meta WHERE key = ?")
      .get(ANNOUNCE_CHANNEL_META_KEY) as { value: string } | null;
    const v = row?.value?.trim() ?? "";
    return v.length > 0 ? v : null;
  }

  /** Set the announcements channel (CHANNEL picker snowflake). */
  setChannelId(channelId: string): void {
    const id = channelId.trim();
    if (!id) {
      this.clearChannelId();
      return;
    }
    this.db.run(
      `INSERT INTO schema_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [ANNOUNCE_CHANNEL_META_KEY, id],
    );
  }

  /** Clear — default-deny until set again. */
  clearChannelId(): void {
    this.db.run("DELETE FROM schema_meta WHERE key = ?", [
      ANNOUNCE_CHANNEL_META_KEY,
    ]);
  }
}
