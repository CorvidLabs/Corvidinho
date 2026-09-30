/**
 * SAFE-6 — scrub vendor-key-looking secrets before anything is saved to the
 * shared SQLite DB, and re-scrub stored rows when the rules tighten.
 *
 * Redaction keeps a short kind label, never the value. Bump
 * SCRUB_RULES_VERSION whenever PATTERNS tighten or SCRUB_TARGETS gains a
 * column: the next open of the DB re-scrubs existing rows once (recorded in
 * schema_meta). No CLI/slash surface.
 */

import type { Database } from "bun:sqlite";

/**
 * Bump when PATTERNS tighten (or SCRUB_TARGETS gains a column) so stored rows
 * are re-scrubbed on next open.
 * 2 = a private-key block with no END line is redacted too (REQ-discord-066).
 * 3 = open Discord asks (`discord_sessions.pending_ask`) are re-scrubbed too,
 *     value by value as JSON (REQ-discord-066).
 */
export const SCRUB_RULES_VERSION = 3;
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

/**
 * Env vars whose values are secrets (`.env.example`). An error line never
 * echoes one, even when the value has no vendor-key shape (e.g. a mistyped
 * bot token).
 */
const SECRET_ENV_NAMES = [
  "DISCORD_TOKEN",
  "DISCORD_BOT_TOKEN",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "CORVIDINHO_LLM_API_KEY",
  "OPENAI_API_KEY",
  // AGENT-13: the anthropic: provider's key.
  "ANTHROPIC_API_KEY",
  "CORVIDINHO_AUDIT_HMAC_KEY",
  // Brave Search key (PLUGIN-7, #318): no known vendor shape, so its value is redacted by name.
  "BRAVE_SEARCH_API_KEY",
] as const;

/** Shorter values are too likely to be ordinary words to redact safely. */
const MIN_ENV_SECRET_LEN = 8;

/** Programming-error classes whose name says more than the message alone. */
const NAMED_ERRORS = new Set(["TypeError", "RangeError", "ReferenceError", "SyntaxError"]);

/** Cap for {@link formatErrorLine}. */
export const ERROR_LINE_MAX = 300;

/**
 * Replace the literal value of every set secret env var (`DISCORD_TOKEN`,
 * `GITHUB_TOKEN`, the LLM key, …) with `[redacted:env-secret]`, so text
 * leaving the box never carries one even when it has no vendor-key shape.
 */
export function redactSecretEnvValues(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  let out = text;
  for (const name of SECRET_ENV_NAMES) {
    const v = env[name]?.trim();
    if (v && v.length >= MIN_ENV_SECRET_LEN) {
      out = out.split(v).join("[redacted:env-secret]");
    }
  }
  return out;
}

/**
 * One SAFE-6 line for an error shown to an operator (CLI-4): the message's
 * first line only (no stack, code frame or library object dump), vendor-key
 * shapes scrubbed, the literal value of any set secret env var redacted, and
 * capped at `max` characters.
 */
export function formatErrorLine(
  err: unknown,
  opts: { env?: NodeJS.ProcessEnv; max?: number } = {},
): string {
  let text: string;
  try {
    if (err instanceof Error) {
      const msg = typeof err.message === "string" ? err.message.trim() : "";
      const name = typeof err.name === "string" ? err.name : "";
      text = !msg ? name || "Error" : NAMED_ERRORS.has(name) ? `${name}: ${msg}` : msg;
    } else if (typeof err === "string") {
      text = err;
    } else if (
      err &&
      typeof err === "object" &&
      typeof (err as { message?: unknown }).message === "string"
    ) {
      text = (err as { message: string }).message;
    } else {
      text = String(err);
    }
  } catch {
    // e.g. String() of a null-prototype object: the report itself must not throw.
    text = "(unprintable error)";
  }
  text = redactSecretEnvValues(text, opts.env ?? process.env);
  let line = scrubSecrets(text.trim()).split(/\r?\n/)[0]?.trim() ?? "";
  if (!line) line = "unknown error";
  const max = opts.max ?? ERROR_LINE_MAX;
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Nullable column helper: null/undefined stay null. */
export function scrubOpt(text: string | null | undefined): string | null {
  return text == null ? null : scrubSecrets(text);
}

/**
 * Scrub every string value of a stored JSON document (SAFE-6 re-scrub). Key
 * names stay as they are; when a value changes the document is re-serialized,
 * so it stays valid JSON — a text scrub could cut a closing quote or brace (a
 * private-key block with no END line runs to the end of the text). Unchanged
 * input is returned as is. Ids are values too: an id that does not look like
 * a secret is left alone by the scrub, so it stays byte-identical. Text that
 * does not parse (`parsed: false`) is scrubbed as text: nothing reads it as
 * JSON, so the scrub cannot break it.
 */
export function scrubJsonText(raw: string): { text: string; parsed: boolean } {
  let changed = false;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      const s = scrubSecrets(v);
      if (s !== v) changed = true;
      return s;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  let next: unknown;
  try {
    next = walk(JSON.parse(raw));
  } catch {
    return { text: scrubSecrets(raw), parsed: false };
  }
  return { text: changed ? JSON.stringify(next) : raw, parsed: true };
}

/**
 * Every free-text column Corvidinho persists. Keep in sync with src/store/db.ts
 * and module-owned tables (spend_ledger: src/agent/spend.ts; spend_alerts:
 * src/agent/spend-alerts.ts;
 * discord_session_turns: src/discord/session-thread.ts; watch_owner_asks:
 * src/watch/owner-ask.ts). `json` columns hold a
 * JSON document and are re-scrubbed value by value ({@link scrubJsonText}).
 */
export const SCRUB_TARGETS: ReadonlyArray<{
  table: string;
  columns: readonly string[];
  json?: readonly string[];
}> = [
  // Open asks (src/discord/session-store.ts) are JSON: their askId, option
  // ids and stub message id never look like a secret, so they stay as they
  // are and an open Choose button keeps working.
  { table: "discord_sessions", columns: ["topic"], json: ["pending_ask"] },
  { table: "discord_session_turns", columns: ["content"] },
  { table: "discord_work_tasks", columns: ["description", "summary"] },
  { table: "schedules", columns: ["name", "description", "prompt"] },
  // AUTONOMY-6.a (schema v15, src/scheduler/store.ts): a schedule ask's
  // answer and its listed choices (JSON; option ids never look like a
  // secret, so an open Choose button keeps working). New columns, empty in
  // every row written under older rules, so no rules version bump.
  {
    table: "schedule_runs",
    columns: ["summary", "error", "ask_question", "ask_answer"],
    json: ["ask_options"],
  },
  { table: "memories", columns: ["key", "content"] },
  { table: "watch_sessions", columns: ["topic"] },
  // SESSION-5/6, AGENT-6.a (src/store/conversation.ts): the condensed summary
  // and the kept turns (JSON; each turn's text re-scrubbed value by value).
  { table: "conversation_threads", columns: ["summary"], json: ["turns"] },
  // SAFE-18 (src/approvals/store.ts): what an Approve card shows — the
  // exact action, target, amount and diff or text.
  { table: "approval_requests", columns: ["title", "action", "target", "amount", "text"] },
  { table: "spend_ledger", columns: ["provider", "model"] },
  // SAFE-14 (src/agent/spend-alerts.ts): the cap scope (`total` or
  // `provider:<id>`, the id as the ledger stores it). A column added by an
  // idempotent ALTER (older rows read `total`), so no rules version bump.
  { table: "spend_alerts", columns: ["scope"] },
  // AGENT-16.a (src/watch/owner-ask.ts): a stuck WATCH run's question waiting
  // for the bridge's owner DM (scrubbed on write; a new table, so no rules
  // version bump: it has no rows written under older rules).
  { table: "watch_owner_asks", columns: ["question"] },
  // GITHUB-9 (src/work/review.ts): a second-model review round's reviewer,
  // the change's authors, what it raised and the changed paths (JSON lists;
  // scrubbed on write; a new table, so no rules version bump).
  { table: "pr_review_rounds", columns: ["reviewer"], json: ["authors", "findings", "changed"] },
  // GITHUB-9.a (src/work/review.ts): the models that changed a checkout
  // (scrubbed on write; a new table, so no rules version bump).
  { table: "pr_change_authors", columns: ["model"] },
];

function tableExists(db: Database, table: string): boolean {
  return (
    db
      .query("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table) != null
  );
}

/**
 * The listed columns a table actually has: a module-owned table adds its
 * newer columns when its module first opens it (e.g. `spend_alerts.scope`),
 * so an older table may lack one; there is nothing to scrub in it yet.
 */
function presentColumns(db: Database, table: string, columns: readonly string[]): string[] {
  const have = new Set(
    (db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name),
  );
  return columns.filter((c) => have.has(c));
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
  /** JSON column values that did not parse and were scrubbed as text. */
  jsonUnparsed: number;
} {
  const byTable: Record<string, number> = {};
  const unparsed: Record<string, number> = {};
  let rowsUpdated = 0;
  db.transaction(() => {
    for (const target of SCRUB_TARGETS) {
      const { table } = target;
      if (!tableExists(db, table)) continue;
      const columns = presentColumns(db, table, target.columns);
      const jsonColumns = presentColumns(db, table, target.json ?? []);
      if (columns.length + jsonColumns.length === 0) continue;
      const rows = db
        .query(
          `SELECT rowid AS _rid, id, ${[...columns, ...jsonColumns].join(", ")} FROM ${table}`,
        )
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
        for (const col of jsonColumns) {
          const v = row[col];
          if (typeof v !== "string") continue;
          const r = scrubJsonText(v);
          if (!r.parsed) {
            const where = `${table}.${col}`;
            unparsed[where] = (unparsed[where] ?? 0) + 1;
          }
          if (r.text !== v) next[col] = r.text;
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
  let jsonUnparsed = 0;
  for (const [where, n] of Object.entries(unparsed)) {
    jsonUnparsed += n;
    // Counts only: the stored text itself is never logged (SAFE-6).
    console.warn(`[scrub] ${where}: ${n} stored value(s) were not valid JSON; scrubbed as text`);
  }
  return { rowsUpdated, byTable, jsonUnparsed };
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
