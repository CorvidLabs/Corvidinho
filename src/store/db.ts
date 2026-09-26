/**
 * Shared bun:sqlite Database for Discord session/work/schedule/memory durability
 * (SESSION + DISCORD-SCHEDULE + MEMORY + SESSION-WORKTREE substrate).
 */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { defaultDbPath, type DataDirOptions } from "./paths.ts";
import { ensureScrubbed } from "./scrub.ts";

export type OpenDbOptions = DataDirOptions & {
  /** Explicit DB file path (tests). */
  path?: string;
  /** When true, use :memory: (ignores path). */
  memory?: boolean;
};

const SCHEMA_V1_SQL = `
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

const SCHEMA_V2_SQL = `
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cron_expression TEXT NOT NULL,
  project TEXT NOT NULL,
  prompt TEXT NOT NULL,
  channel_id TEXT,
  created_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  execution_count INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_run_at INTEGER,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_runs (
  id TEXT PRIMARY KEY NOT NULL,
  schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  summary TEXT,
  error TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_schedules_next_run
  ON schedules(next_run_at);
CREATE INDEX IF NOT EXISTS idx_schedules_status
  ON schedules(status);
CREATE INDEX IF NOT EXISTS idx_schedule_runs_schedule
  ON schedule_runs(schedule_id);
`;

const SCHEMA_V3_SQL = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  deleted_by_user_id TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_owner_cat_key_active
  ON memories(owner_user_id, category, key)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_memories_owner
  ON memories(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_memories_category
  ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_deleted
  ON memories(deleted_at);
`;



/**
 * v5 — SAFE-5 append-only audit chain (src/audit/). UPDATE/DELETE are blocked
 * by triggers; rows hold digests and outcomes, never raw args or content.
 */
const SCHEMA_V5_SQL = `
CREATE TABLE IF NOT EXISTS audit_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  surface TEXT NOT NULL,
  args_digest TEXT NOT NULL,
  outcome TEXT NOT NULL,
  exit_code INTEGER,
  keyed INTEGER NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS audit_log_no_update
  BEFORE UPDATE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
  BEFORE DELETE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
`;

export const SCHEMA_VERSION = 5;

export function migrateCorvidinhoDb(db: Database): void {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA_V1_SQL);
  const row = db
    .query("SELECT value FROM schema_meta WHERE key = 'version'")
    .get() as { value: string } | null;
  let version = row ? parseInt(row.value, 10) : 0;
  if (!row) {
    db.run(
      "INSERT INTO schema_meta (key, value) VALUES ('version', '1')",
    );
    version = 1;
  }
  if (version < 2) {
    db.exec(SCHEMA_V2_SQL);
    db.run(
      "UPDATE schema_meta SET value = ? WHERE key = 'version'",
      ["2"],
    );
    version = 2;
  }
  if (version < 3) {
    db.exec(SCHEMA_V3_SQL);
    db.run(
      "UPDATE schema_meta SET value = ? WHERE key = 'version'",
      ["3"],
    );
    version = 3;
  }
  if (version < 4) {
    // SQLite ALTER ADD COLUMN is idempotent enough for fresh DBs that already
    // have columns only if we check — use try/ignore for re-run safety.
    for (const col of [
      "project",
      "worktree_path",
      "worktree_branch",
      "worktree_state",
    ]) {
      try {
        db.exec(`ALTER TABLE discord_sessions ADD COLUMN ${col} TEXT`);
      } catch {
        // Column already present
      }
    }
    db.run("UPDATE schema_meta SET value = '4' WHERE key = 'version'");
    version = 4;
  }
  if (version < 5) {
    db.exec(SCHEMA_V5_SQL);
    db.run("UPDATE schema_meta SET value = '5' WHERE key = 'version'");
    version = 5;
  }
}

/**
 * Open (and migrate) the shared Corvidinho SQLite DB.
 */
export function openCorvidinhoDb(opts: OpenDbOptions = {}): Database {
  if (opts.memory) {
    const db = new Database(":memory:");
    migrateCorvidinhoDb(db);
    ensureScrubbed(db);
    return db;
  }
  const path = opts.path ?? defaultDbPath(opts);
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  // Bridge, spawned agents and plugins share one file: wait briefly for a
  // writer instead of failing with "database is locked".
  db.exec("PRAGMA busy_timeout = 5000;");
  migrateCorvidinhoDb(db);
  // SAFE-6: re-scrub stored rows once whenever the scrub rules tighten.
  ensureScrubbed(db);
  return db;
}
