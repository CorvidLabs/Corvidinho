/**
 * Shared bun:sqlite Database for Discord session/work/schedule/memory and WATCH
 * session durability (SESSION + DISCORD-SCHEDULE + MEMORY + SESSION-WORKTREE
 * substrate).
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

/**
 * v6 — durable WATCH sessions (#37 slice 1, SESSION-1..3): one row per
 * owner/repo#number (issue_key), same soft TTL as discord_sessions.
 * `topic` is free text (issue title) and is a SAFE-6 scrub target.
 */
const SCHEMA_V6_SQL = `
CREATE TABLE IF NOT EXISTS watch_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  issue_key TEXT NOT NULL UNIQUE,
  repo TEXT NOT NULL,
  number INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  topic TEXT,
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_watch_sessions_activity
  ON watch_sessions(last_activity_at);
`;

/**
 * v7 — schedule owner-ping dedupe (AUTONOMY-2, #44): digest of the question
 * the owner was last pinged about for a schedule, so a stuck schedule pings
 * once instead of every tick. A digest only, never the question text.
 */
const SCHEMA_V7_COLUMNS = ["ask_ping_key"] as const;

/**
 * v8 — session pending ask (AUTONOMY-5/6): JSON of HumanAsk while blocked,
 * so thin acks can restate across bridge restarts within TTL.
 */
const SCHEMA_V8_COLUMNS = ["pending_ask"] as const;

/**
 * v9 — in-flight Discord replies (DISCORD-3 / AGENT-3, REQ-discord-311): one
 * row while the bridge works on a reply, deleted when it finishes, so the
 * next bridge start can mark a reply a dead process left frozen as
 * interrupted. Ids and a timestamp only, never message text.
 */
const SCHEMA_V9_SQL = `
CREATE TABLE IF NOT EXISTS discord_inflight_replies (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  parent_channel_id TEXT,
  progress_message_id TEXT,
  request_message_id TEXT NOT NULL,
  started_at INTEGER NOT NULL
);
`;

/**
 * v10 — schedule run owner (REQ-discord-346): `<pid>:<proc start>` of the
 * bridge or daemon running a schedule run, so the next start fails only runs
 * whose process is gone and never one another live process still owns.
 */
const SCHEMA_V10_RUN_COLUMNS = ["runner"] as const;

/**
 * v11 — needs-human outbox for schedule runs (AUTONOMY-2 / AUTONOMOUS-7,
 * REQ-discord-347): the ask a run stopped with (reason + SAFE-6 scrubbed
 * question) and when a bridge took it to post. A run `corvidinho daemon`
 * claimed (no Discord) keeps its ask pending until a bridge tick posts it.
 */
const SCHEMA_V11_RUN_COLUMNS = [
  ["ask_reason", "TEXT"],
  ["ask_question", "TEXT"],
  ["ask_posted_at", "INTEGER"],
] as const;
const SCHEMA_V11_SQL = `
CREATE INDEX IF NOT EXISTS idx_schedule_runs_pending_ask
  ON schedule_runs(schedule_id)
  WHERE ask_reason IS NOT NULL AND ask_posted_at IS NULL;
`;

/**
 * v12 — forget requests (MEMORY-ACL-6, #101): anyone may ask to be forgotten;
 * the owner approves or denies on a DM Approve/Deny card. One row per ask:
 * ids, status and timestamps only — never memory content or message text
 * (nothing here to scrub, SAFE-6). At most one pending ask per subject.
 */
const SCHEMA_V12_SQL = `
CREATE TABLE IF NOT EXISTS forget_requests (
  id TEXT PRIMARY KEY NOT NULL,
  subject_kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  requester_user_id TEXT NOT NULL,
  origin_channel_id TEXT,
  origin_parent_channel_id TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  card_channel_id TEXT,
  card_message_id TEXT,
  card_posted_at INTEGER,
  decided_at INTEGER,
  decided_by TEXT,
  forgotten_count INTEGER,
  notified_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_forget_requests_status
  ON forget_requests(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_forget_requests_one_pending
  ON forget_requests(subject_kind, subject_id)
  WHERE status = 'pending';
`;

/**
 * v13 — retained conversations (SESSION-5/6, SESSION-3.a, AGENT-6.a;
 * REQ-discord-472 / REQ-watch-472; src/store/conversation.ts): one row per
 * Discord conversation (a thread, or a channel talk and the sessions resumed
 * from it) or WATCH issue/PR thread, holding its condensed summary and last
 * turns for 30 days after its last update. `summary` and `turns` (JSON) are
 * SAFE-6 scrub targets; `participants` and `bot_message_ids` hold ids only;
 * `project` is the Discord session's project directory, so a session resumed
 * from it works there again (SESSION-WORKTREE-4).
 */
const SCHEMA_V13_SQL = `
CREATE TABLE IF NOT EXISTS conversation_threads (
  id TEXT PRIMARY KEY NOT NULL,
  surface TEXT NOT NULL,
  thread_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_id TEXT,
  project TEXT,
  summary TEXT NOT NULL DEFAULT '',
  turns TEXT NOT NULL DEFAULT '[]',
  participants TEXT NOT NULL DEFAULT '[]',
  bot_message_ids TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversation_threads_thread
  ON conversation_threads(surface, thread_key, user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_threads_session
  ON conversation_threads(session_id);
CREATE INDEX IF NOT EXISTS idx_conversation_threads_updated
  ON conversation_threads(updated_at);
`;

/**
 * v14 — Approve/Deny card engine (SAFE-18..20, #96; REQ-discord-096,
 * src/discord/approval-cards.ts). `approval_requests` holds a card any
 * process on the data dir can raise (src/approvals/store.ts): its kind and
 * class (plain | destructive | money), the exact action, target, amount and
 * diff or text shown (SAFE-6 scrub targets), the action hash, the waiting
 * process (`<pid>:<proc start>`), status and times. `approval_codes` holds
 * one-time codes (src/approvals/code.ts): only a salted hash of each code,
 * bound to its card and action hash, with expiry and use/void times.
 * `forget_requests.action_hash` records the action a forget card showed
 * (REQ-discord-101), so Approve never deletes more than the card said.
 */
const SCHEMA_V14_SQL = `
CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  class TEXT NOT NULL,
  title TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  amount TEXT NOT NULL,
  text TEXT,
  text_label TEXT,
  action_hash TEXT NOT NULL,
  requester TEXT,
  waiter TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  card_channel_id TEXT,
  card_message_id TEXT,
  card_posted_at INTEGER,
  decided_at INTEGER,
  decided_by TEXT,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_kind_status
  ON approval_requests(kind, status);
CREATE TABLE IF NOT EXISTS approval_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  request_id TEXT NOT NULL,
  action_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  voided_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_approval_codes_request
  ON approval_codes(kind, request_id);
`;

/**
 * v15 — blocking schedule asks (AUTONOMY-6.a, REQ-discord-606,
 * src/scheduler/store.ts): every ask a schedule run records stays open until
 * the schedule's creator or the owner answers or cancels it on Discord, and
 * the schedule's due runs wait (skipped, no catch-up) with one note.
 * `ask_options` holds the ask's listed choices (JSON, labels SAFE-6 scrubbed,
 * a re-scrub target), `ask_blocking` marks an ask recorded under these rules,
 * `ask_closed_at` / `ask_outcome` (`answered` | `picked` | `cancelled` |
 * `superseded`) / `ask_closed_by` say when, how and by whom it closed,
 * `ask_answer` is the answer handed to the next run (SAFE-6 scrubbed, a
 * re-scrub target), `ask_skip_at` is when a due run first waited on it and
 * `ask_note_at` when the one wait note went out. Asks recorded before v15
 * are closed as `superseded`, so an upgrade never blocks a schedule on a
 * question that had no Cancel.
 */
const SCHEMA_V15_RUN_COLUMNS = [
  ["ask_options", "TEXT"],
  ["ask_blocking", "INTEGER NOT NULL DEFAULT 0"],
  ["ask_closed_at", "INTEGER"],
  ["ask_outcome", "TEXT"],
  ["ask_answer", "TEXT"],
  ["ask_closed_by", "TEXT"],
  ["ask_skip_at", "INTEGER"],
  ["ask_note_at", "INTEGER"],
] as const;
const SCHEMA_V15_SQL = `
CREATE INDEX IF NOT EXISTS idx_schedule_runs_open_ask
  ON schedule_runs(schedule_id)
  WHERE ask_blocking = 1 AND ask_closed_at IS NULL;
`;

export const SCHEMA_VERSION = 15;

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
  if (version < 6) {
    db.exec(SCHEMA_V6_SQL);
    db.run("UPDATE schema_meta SET value = '6' WHERE key = 'version'");
    version = 6;
  }
  if (version < 7) {
    for (const col of SCHEMA_V7_COLUMNS) {
      try {
        db.exec(`ALTER TABLE schedules ADD COLUMN ${col} TEXT`);
      } catch {
        // Column already present
      }
    }
    db.run("UPDATE schema_meta SET value = '7' WHERE key = 'version'");
    version = 7;
  }
  if (version < 8) {
    for (const col of SCHEMA_V8_COLUMNS) {
      try {
        db.exec(`ALTER TABLE discord_sessions ADD COLUMN ${col} TEXT`);
      } catch {
        // Column already present
      }
    }
    db.run("UPDATE schema_meta SET value = '8' WHERE key = 'version'");
    version = 8;
  }
  if (version < 9) {
    db.exec(SCHEMA_V9_SQL);
    db.run("UPDATE schema_meta SET value = '9' WHERE key = 'version'");
    version = 9;
  }
  if (version < 10) {
    for (const col of SCHEMA_V10_RUN_COLUMNS) {
      try {
        db.exec(`ALTER TABLE schedule_runs ADD COLUMN ${col} TEXT`);
      } catch {
        // Column already present
      }
    }
    db.run("UPDATE schema_meta SET value = '10' WHERE key = 'version'");
    version = 10;
  }
  if (version < 11) {
    for (const [col, type] of SCHEMA_V11_RUN_COLUMNS) {
      try {
        db.exec(`ALTER TABLE schedule_runs ADD COLUMN ${col} ${type}`);
      } catch {
        // Column already present
      }
    }
    db.exec(SCHEMA_V11_SQL);
    db.run("UPDATE schema_meta SET value = '11' WHERE key = 'version'");
    version = 11;
  }
  if (version < 12) {
    db.exec(SCHEMA_V12_SQL);
    db.run("UPDATE schema_meta SET value = '12' WHERE key = 'version'");
    version = 12;
  }
  if (version < 13) {
    db.exec(SCHEMA_V13_SQL);
    db.run("UPDATE schema_meta SET value = '13' WHERE key = 'version'");
    version = 13;
  }
  if (version < 14) {
    try {
      db.exec("ALTER TABLE forget_requests ADD COLUMN action_hash TEXT");
    } catch {
      // Column already present
    }
    db.exec(SCHEMA_V14_SQL);
    db.run("UPDATE schema_meta SET value = '14' WHERE key = 'version'");
    version = 14;
  }
  if (version < 15) {
    for (const [col, type] of SCHEMA_V15_RUN_COLUMNS) {
      try {
        db.exec(`ALTER TABLE schedule_runs ADD COLUMN ${col} ${type}`);
      } catch {
        // Column already present
      }
    }
    db.exec(SCHEMA_V15_SQL);
    // Asks recorded before v15 had no Cancel: close them, so none blocks.
    db.run(
      `UPDATE schedule_runs SET ask_closed_at = ?, ask_outcome = 'superseded'
       WHERE ask_reason IS NOT NULL AND ask_closed_at IS NULL AND ask_blocking = 0`,
      [Date.now()],
    );
    db.run("UPDATE schema_meta SET value = '15' WHERE key = 'version'");
    version = 15;
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
