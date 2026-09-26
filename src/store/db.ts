/**
 * Shared bun:sqlite Database for Discord session/work durability
 * (SESSION substrate; same file reserved for future MEMORY #41).
 */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { defaultDbPath, type DataDirOptions } from "./paths.ts";

export type OpenDbOptions = DataDirOptions & {
  /** Explicit DB file path (tests). */
  path?: string;
  /** When true, use :memory: (ignores path). */
  memory?: boolean;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS discord_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  channel_id TEXT NOT NULL,
  thread_id TEXT,
  user_id TEXT NOT NULL,
  topic TEXT,
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS discord_session_bot_messages (
  bot_message_id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES discord_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS discord_work_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  description TEXT NOT NULL,
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  session_id TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_discord_sessions_thread
  ON discord_sessions(thread_id);
CREATE INDEX IF NOT EXISTS idx_discord_sessions_activity
  ON discord_sessions(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_discord_work_updated
  ON discord_work_tasks(updated_at);
`;

export function migrateCorvidinhoDb(db: Database): void {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA_SQL);
  const row = db
    .query("SELECT value FROM schema_meta WHERE key = 'version'")
    .get() as { value: string } | null;
  if (!row) {
    db.run(
      "INSERT INTO schema_meta (key, value) VALUES ('version', '1')",
    );
  }
}

/**
 * Open (and migrate) the shared Corvidinho SQLite DB.
 */
export function openCorvidinhoDb(opts: OpenDbOptions = {}): Database {
  if (opts.memory) {
    const db = new Database(":memory:");
    migrateCorvidinhoDb(db);
    return db;
  }
  const path = opts.path ?? defaultDbPath(opts);
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  migrateCorvidinhoDb(db);
  return db;
}
