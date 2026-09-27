/**
 * SAFE-6 — scrub vendor-key-looking secrets before anything is saved to the
 * shared SQLite DB, and re-scrub stored rows when the rules tighten.
 *
 * Redaction keeps a short kind label, never the value. Bump
 * SCRUB_RULES_VERSION whenever PATTERNS tighten: the next open of the DB
 * re-scrubs existing rows once (recorded in schema_meta). No CLI/slash surface.
 */

import type { Database } from "bun:sqlite";

/**
 * Bump when PATTERNS tighten so stored rows are re-scrubbed on next open.
 * 2 = a private-key block with no END line is redacted too (REQ-discord-066).
 */
export const SCRUB_RULES_VERSION = 2;
const RULES_VERSION_KEY = "scrub_rules_version";

const redacted = (kind: string) => `[redacted:${kind}]`;

/**
 * Order matters: more specific shapes first (sk-ant- before sk-).
 *
 * Every pattern must run in linear time: callers scrub text written by others
 * (e.g. PR diffs), so a pattern whose match attempts can each rescan to the
 * end of the input is a denial-of-service. The private-key body stops at the
 * next BEGIN line and the JWT header stops at the next `-eyJ`, so each part of
 * the text is scanned by at most one match attempt.
 *
 * A private-key block whose END line is missing (text clipped mid-key, or a
 * key pasted without its footer) is still a key: once a BEGIN … PRIVATE KEY
 * header matches, the block ends at its END line, else just before the next
 * BEGIN line, else at the end of the text. A header therefore always yields a
 * match, so no attempt fails after rescanning the rest of the input.
 */
const PATTERNS: ReadonlyArray<{ kind: string; re: RegExp; keepPrefix?: boolean }> = [
  {
    kind: "private-key",
    re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----(?:(?!-----BEGIN )[\s\S])*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|(?=-----BEGIN )|$)/g,
  },
  { kind: "github-token", re: /\bgithub_pat_[A-Za-z0-9_]{20,}/g },
  { kind: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },
  { kind: "anthropic-key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: "openai-key", re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g },
  { kind: "slack-token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { kind: "aws-key", re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { kind: "google-key", re: /\bAIza[0-9A-Za-z_-]{35}/g },
  {
    kind: "jwt",
    re: /\beyJ(?:(?!-eyJ)[A-Za-z0-9_-]){8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  },
  {
    kind: "discord-token",
    re: /\b[MNO][A-Za-z0-9_-]{23,27}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,40}/g,
  },
  { kind: "bearer", re: /\b(Bearer)\s+[A-Za-z0-9._~+/-]{20,}=*/gi, keepPrefix: true },
];

/** Redact secrets from text. Idempotent; ordinary text is left alone. */
export function scrubSecrets(text: string): string {
  let out = text;
  for (const { kind, re, keepPrefix } of PATTERNS) {
    out = out.replace(re, (_m: string, g1?: string) =>
      keepPrefix && typeof g1 === "string" ? `${g1} ${redacted(kind)}` : redacted(kind),
    );
  }
  return out;
}

/** Nullable column helper: null/undefined stay null. */
export function scrubOpt(text: string | null | undefined): string | null {
  return text == null ? null : scrubSecrets(text);
}

/**
 * Every free-text column Corvidinho persists. Keep in sync with src/store/db.ts
 * and module-owned tables (spend_ledger: src/agent/spend.ts).
 */
export const SCRUB_TARGETS: ReadonlyArray<{ table: string; columns: readonly string[] }> = [
  { table: "discord_sessions", columns: ["topic"] },
  { table: "discord_work_tasks", columns: ["description", "summary"] },
  { table: "schedules", columns: ["name", "description", "prompt"] },
  { table: "schedule_runs", columns: ["summary", "error"] },
  { table: "memories", columns: ["key", "content"] },
  { table: "watch_sessions", columns: ["topic"] },
  { table: "spend_ledger", columns: ["provider", "model"] },
];

function tableExists(db: Database, table: string): boolean {
  return (
    db
      .query("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table) != null
  );
}

/**
 * Re-scrub every stored free-text column. Returns rows changed per table.
 * A scrubbed memory key that would collide with an existing active key gets
 * a short row-id suffix so the unique index holds. BEGIN IMMEDIATE, so a
 * concurrent writer is waited for under busy_timeout.
 */
export function rescrubDatabase(db: Database): {
  rowsUpdated: number;
  byTable: Record<string, number>;
} {
  const byTable: Record<string, number> = {};
  let rowsUpdated = 0;
  db.transaction(() => {
    for (const { table, columns } of SCRUB_TARGETS) {
      if (!tableExists(db, table)) continue;
      const rows = db
        .query(`SELECT rowid AS _rid, id, ${columns.join(", ")} FROM ${table}`)
        .all() as Array<Record<string, unknown>>;
      let changed = 0;
      for (const row of rows) {
        const next: Record<string, string | null> = {};
        for (const col of columns) {
          const v = row[col];
          if (typeof v !== "string") continue;
          const s = scrubSecrets(v);
          if (s !== v) next[col] = s;
        }
        const cols = Object.keys(next);
        if (cols.length === 0) continue;
        const write = () =>
          db.run(
            `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE rowid = ?`,
            [...cols.map((c) => next[c]!), row._rid as number],
          );
        try {
          write();
        } catch (err) {
          if (table !== "memories" || next.key == null) throw err;
          next.key = `${next.key}#${String(row.id).slice(0, 8)}`;
          write();
        }
        changed += 1;
      }
      byTable[table] = changed;
      rowsUpdated += changed;
    }
  }).immediate();
  return { rowsUpdated, byTable };
}

/**
 * Re-scrub once per rules version (SAFE-6 "re-scrub history when rules
 * tighten"). Called on every DB open; a no-op when already current.
 */
export function ensureScrubbed(db: Database): { ran: boolean; rowsUpdated: number } {
  const row = db
    .query("SELECT value FROM schema_meta WHERE key = ?")
    .get(RULES_VERSION_KEY) as { value: string } | null;
  const stored = row ? Number.parseInt(row.value, 10) : 0;
  if (Number.isFinite(stored) && stored >= SCRUB_RULES_VERSION) {
    return { ran: false, rowsUpdated: 0 };
  }
  const { rowsUpdated } = rescrubDatabase(db);
  db.run(
    `INSERT INTO schema_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [RULES_VERSION_KEY, String(SCRUB_RULES_VERSION)],
  );
  return { ran: true, rowsUpdated };
}
