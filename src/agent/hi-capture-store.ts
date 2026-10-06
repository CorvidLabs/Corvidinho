/**
 * AGENT-18 hi drafts (#89): the hi capture requests a run records and the
 * owner answers on the `hi` card (src/discord/hi-card.ts), and the ledger of
 * what each approved capture changed under `hi/`, which the hi guard reads
 * (src/agent/repo-ways.ts) so a `hi/` change that is exactly what approved
 * captures made passes while every other `hi/` change still blocks.
 *
 * Both tables are this module's own (`CREATE TABLE IF NOT EXISTS`, created
 * on first use; no schema version bump), on the shared data dir DB, so a
 * run's process records a request and the running bridge DMs its card:
 * - `hi_capture_requests`: one request per `hi-draft` call — the drafts
 *   (ids and texts, already refused when scrubbing would change one), the
 *   session worktree they are captured in (its path, branch, HEAD and the
 *   repository's git common dir), who asked from where, the card, the
 *   decision and, once approved, the commit on the branch that holds the
 *   capture. No answer by `expires_at` is a no (SAFE-20).
 * - `hi_capture_files`: for each approved capture, every `hi/` path it
 *   changed, as a content key before and after ({@link hiContentKey}, or
 *   {@link HI_ABSENT}). The hi guard allows a changed path only when a chain
 *   of these steps leads from its content at the session base to its content
 *   now ({@link hiCaptureChainAllows}).
 */

import { createHash, randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import { openCorvidinhoDb } from "../store/db.ts";

/** A drafted criterion: a hi id and its one-line text. */
export type HiDraft = { id: string; text: string };

export type HiCaptureStatus = "pending" | "approved" | "denied" | "expired";

/** The roles that may draft (decided per run, re-read at the call). */
export type HiDraftRole = "owner" | "team";

export type HiCaptureRequest = {
  id: string;
  status: HiCaptureStatus;
  /** Real path of the repository's git common dir (the ledger key). */
  repo: string;
  /** Member-safe project label shown on the card (never a host path). */
  project: string;
  /** Real path of the session worktree the drafts are captured in. */
  worktree: string;
  branch: string;
  head: string;
  drafts: HiDraft[];
  /** Discord user id of who asked. */
  requester: string;
  role: HiDraftRole;
  surface: string;
  sessionId: string;
  originChannelId?: string;
  originParentChannelId?: string;
  createdAt: number;
  expiresAt: number;
  cardChannelId?: string;
  cardMessageId?: string;
  cardPostedAt?: number;
  actionHash?: string;
  decidedAt?: number;
  decidedBy?: string;
  /** Ids captured on Approve. */
  captured?: string[];
  /** The commit on `branch` that holds the approved capture. */
  commit?: string;
  notifiedAt?: number;
};

/** How long a card stays open: no answer by then is a no (SAFE-20). */
export const HI_CAPTURE_TTL_MS = 24 * 60 * 60 * 1000;

/** The ledger's key for a path that does not exist. */
export const HI_ABSENT = "absent";

const SQL = `
CREATE TABLE IF NOT EXISTS hi_capture_requests (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  repo TEXT NOT NULL,
  project TEXT NOT NULL,
  worktree TEXT NOT NULL,
  branch TEXT NOT NULL,
  head TEXT NOT NULL,
  drafts TEXT NOT NULL,
  requester TEXT NOT NULL,
  role TEXT NOT NULL,
  surface TEXT NOT NULL,
  session_id TEXT NOT NULL,
  origin_channel_id TEXT,
  origin_parent_channel_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  card_channel_id TEXT,
  card_message_id TEXT,
  card_posted_at INTEGER,
  action_hash TEXT,
  decided_at INTEGER,
  decided_by TEXT,
  captured TEXT,
  capture_commit TEXT,
  notified_at INTEGER
);
CREATE INDEX IF NOT EXISTS hi_capture_requests_status ON hi_capture_requests (status, created_at);
CREATE TABLE IF NOT EXISTS hi_capture_files (
  request_id TEXT NOT NULL,
  repo TEXT NOT NULL,
  path TEXT NOT NULL,
  before_key TEXT NOT NULL,
  after_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS hi_capture_files_repo ON hi_capture_files (repo, path);
`;

/** Create this module's tables when missing (idempotent). */
export function ensureHiCaptureTables(db: Database): void {
  db.exec(SQL);
}

/**
 * The ledger key of a `hi/` file's content: its text (UTF-8) and whether it
 * is executable. Text with a U+FFFD replacement character gets no key (the
 * caller treats null as "never allowed"), so two different invalid byte
 * runs can never share one.
 */
export function hiContentKey(text: string, executable: boolean): string | null {
  if (text.includes("�")) return null;
  return `text:${executable ? "x" : "-"}:${createHash("sha256").update(text).digest("hex")}`;
}

type Row = {
  id: string;
  status: string;
  repo: string;
  project: string;
  worktree: string;
  branch: string;
  head: string;
  drafts: string;
  requester: string;
  role: string;
  surface: string;
  session_id: string;
  origin_channel_id: string | null;
  origin_parent_channel_id: string | null;
  created_at: number;
  expires_at: number;
  card_channel_id: string | null;
  card_message_id: string | null;
  card_posted_at: number | null;
  action_hash: string | null;
  decided_at: number | null;
  decided_by: string | null;
  captured: string | null;
  capture_commit: string | null;
  notified_at: number | null;
};

function parseDrafts(raw: string): HiDraft[] {
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .filter((d): d is HiDraft => !!d && typeof d.id === "string" && typeof d.text === "string")
      .map((d) => ({ id: d.id, text: d.text }));
  } catch {
    return [];
  }
}

function toRequest(r: Row): HiCaptureRequest {
  const out: HiCaptureRequest = {
    id: r.id,
    status: (["pending", "approved", "denied", "expired"].includes(r.status) ? r.status : "expired") as HiCaptureStatus,
    repo: r.repo,
    project: r.project,
    worktree: r.worktree,
    branch: r.branch,
    head: r.head,
    drafts: parseDrafts(r.drafts),
    requester: r.requester,
    role: r.role === "owner" ? "owner" : "team",
    surface: r.surface,
    sessionId: r.session_id,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  };
  if (r.origin_channel_id) out.originChannelId = r.origin_channel_id;
  if (r.origin_parent_channel_id) out.originParentChannelId = r.origin_parent_channel_id;
  if (r.card_channel_id) out.cardChannelId = r.card_channel_id;
  if (r.card_message_id) out.cardMessageId = r.card_message_id;
  if (r.card_posted_at != null) out.cardPostedAt = r.card_posted_at;
  if (r.action_hash) out.actionHash = r.action_hash;
  if (r.decided_at != null) out.decidedAt = r.decided_at;
  if (r.decided_by) out.decidedBy = r.decided_by;
  if (r.captured != null) {
    try {
      const ids = JSON.parse(r.captured) as unknown;
      if (Array.isArray(ids)) out.captured = ids.filter((x): x is string => typeof x === "string");
    } catch {
      /* none */
    }
  }
  if (r.capture_commit) out.commit = r.capture_commit;
  if (r.notified_at != null) out.notifiedAt = r.notified_at;
  return out;
}

export type RecordHiCaptureInput = {
  repo: string;
  project: string;
  worktree: string;
  branch: string;
  head: string;
  drafts: readonly HiDraft[];
  requester: string;
  role: HiDraftRole;
  surface: string;
  sessionId: string;
  originChannelId?: string;
  originParentChannelId?: string;
  ttlMs?: number;
};

/** The `hi_capture_requests` rows (the `hi` card kind's store). */
export class HiCaptureStore {
  private readonly db: Database;
  private readonly now: () => number;

  constructor(opts: { db: Database; now?: () => number }) {
    this.db = opts.db;
    this.now = opts.now ?? Date.now;
    ensureHiCaptureTables(this.db);
  }

  /** Record a pending request (the drafts are stored exactly as validated). */
  request(input: RecordHiCaptureInput): HiCaptureRequest {
    const now = this.now();
    const id = `hc_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    this.db.run(
      `INSERT INTO hi_capture_requests
        (id, status, repo, project, worktree, branch, head, drafts, requester, role, surface,
         session_id, origin_channel_id, origin_parent_channel_id, created_at, expires_at)
       VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.repo,
        input.project,
        input.worktree,
        input.branch,
        input.head,
        JSON.stringify(input.drafts.map((d) => ({ id: d.id, text: d.text }))),
        input.requester,
        input.role,
        input.surface,
        input.sessionId,
        input.originChannelId?.trim() || null,
        input.originParentChannelId?.trim() || null,
        now,
        now + Math.max(0, input.ttlMs ?? HI_CAPTURE_TTL_MS),
      ],
    );
    return this.get(id)!;
  }

  get(id: string): HiCaptureRequest | undefined {
    const r = this.db.query(`SELECT * FROM hi_capture_requests WHERE id = ?`).get(id) as Row | null;
    return r ? toRequest(r) : undefined;
  }

  /** Pending, still open, card not sent yet. */
  undelivered(now = this.now()): HiCaptureRequest[] {
    return (
      this.db
        .query(
          `SELECT * FROM hi_capture_requests
           WHERE status = 'pending' AND card_posted_at IS NULL AND expires_at > ? ORDER BY created_at`,
        )
        .all(now) as Row[]
    ).map(toRequest);
  }

  /** Pending past its expiry (no answer ⇒ no). */
  expiredPending(now = this.now()): HiCaptureRequest[] {
    return (
      this.db
        .query(`SELECT * FROM hi_capture_requests WHERE status = 'pending' AND expires_at <= ? ORDER BY created_at`)
        .all(now) as Row[]
    ).map(toRequest);
  }

  pending(): HiCaptureRequest[] {
    return (
      this.db.query(`SELECT * FROM hi_capture_requests WHERE status = 'pending' ORDER BY created_at`).all() as Row[]
    ).map(toRequest);
  }

  /** Decided requests whose asker was not told yet. */
  unnotified(): HiCaptureRequest[] {
    return (
      this.db
        .query(`SELECT * FROM hi_capture_requests WHERE status <> 'pending' AND notified_at IS NULL ORDER BY decided_at`)
        .all() as Row[]
    ).map(toRequest);
  }

  markCardPosted(id: string, channelId: string, messageId: string, actionHash: string): void {
    this.db.run(
      `UPDATE hi_capture_requests SET card_channel_id = ?, card_message_id = ?, card_posted_at = ?, action_hash = ?
       WHERE id = ? AND status = 'pending'`,
      [channelId, messageId, this.now(), actionHash, id],
    );
  }

  resetCard(id: string): void {
    this.db.run(
      `UPDATE hi_capture_requests SET card_channel_id = NULL, card_message_id = NULL, card_posted_at = NULL,
         action_hash = NULL
       WHERE id = ? AND status = 'pending'`,
      [id],
    );
  }

  /** Compare-and-set a pending request closed; false when it already was. */
  decide(id: string, status: "approved" | "denied" | "expired", opts: { by?: string } = {}): boolean {
    const res = this.db.run(
      `UPDATE hi_capture_requests SET status = ?, decided_at = ?, decided_by = ? WHERE id = ? AND status = 'pending'`,
      [status, this.now(), opts.by ?? null, id],
    );
    return Number(res.changes) === 1;
  }

  /** The ids an approved request captured, and the commit that holds them. */
  markCaptured(id: string, ids: readonly string[], commit: string): void {
    this.db.run(`UPDATE hi_capture_requests SET captured = ?, capture_commit = ? WHERE id = ?`, [
      JSON.stringify([...ids]),
      commit,
      id,
    ]);
  }

  markNotified(id: string): void {
    this.db.run(`UPDATE hi_capture_requests SET notified_at = ? WHERE id = ?`, [this.now(), id]);
  }
}

/** One `hi/` path an approved capture changed: its content key before and after. */
export type HiCaptureFileStep = { path: string; before: string; after: string };

/** Record what an approved capture changed (inside the approval's transaction). */
export function recordHiCaptureFiles(
  db: Database,
  requestId: string,
  repo: string,
  steps: readonly HiCaptureFileStep[],
  now: number = Date.now(),
): void {
  ensureHiCaptureTables(db);
  for (const s of steps) {
    db.run(
      `INSERT INTO hi_capture_files (request_id, repo, path, before_key, after_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [requestId, repo, s.path, s.before, s.after, now],
    );
  }
}

/** path → the before/after steps approved captures made in `repo`. */
export type HiCaptureEdges = Map<string, Array<{ before: string; after: string }>>;

/** The steps of every approved capture in `repo` (a request whose status is `approved`). */
export function hiCaptureEdges(db: Database, repo: string): HiCaptureEdges {
  ensureHiCaptureTables(db);
  const rows = db
    .query(
      `SELECT f.path AS path, f.before_key AS before, f.after_key AS after
       FROM hi_capture_files f JOIN hi_capture_requests r ON r.id = f.request_id
       WHERE f.repo = ? AND r.status = 'approved'`,
    )
    .all(repo) as { path: string; before: string; after: string }[];
  const out: HiCaptureEdges = new Map();
  for (const r of rows) {
    const list = out.get(r.path) ?? [];
    list.push({ before: r.before, after: r.after });
    out.set(r.path, list);
  }
  return out;
}

/**
 * True when approved captures alone explain `path` going from `before` to
 * `after`: a chain of one or more recorded steps leads from one to the other.
 * A null key (unreadable, or not a plain text file) and a path that ends
 * absent (a capture never deletes) are never allowed.
 */
export function hiCaptureChainAllows(
  edges: HiCaptureEdges,
  path: string,
  before: string | null,
  after: string | null,
): boolean {
  if (before === null || after === null || after === HI_ABSENT) return false;
  const steps = edges.get(path);
  if (!steps || steps.length === 0) return false;
  const seen = new Set<string>();
  let frontier = [before];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const k of frontier) {
      for (const s of steps) {
        if (s.before !== k) continue;
        if (s.after === after) return true;
        if (!seen.has(s.after)) {
          seen.add(s.after);
          next.push(s.after);
        }
      }
    }
    frontier = next;
  }
  return false;
}

/**
 * The approved-capture steps of `repo` from the shared data dir DB (`env`,
 * default the process env); null when the DB can't be read (the hi guard
 * then allows nothing: fail closed).
 */
export function loadHiCaptureEdges(repo: string, env: NodeJS.ProcessEnv = process.env): HiCaptureEdges | null {
  try {
    const db = openCorvidinhoDb({ env });
    try {
      return hiCaptureEdges(db, repo);
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}
