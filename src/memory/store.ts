/**
 * Local SQLite MemoryStore with per-user ACL (MEMORY-1..4 / MEMORY-ACL-1..5).
 *
 * `owner_user_id` holds the row's scope (src/memory/scope.ts): a Discord user
 * id (an undeclared user, as before), `person:<id>` (a declared person's
 * profile, MEMORY-5) or `project:<key>` (a repo's memory, MEMORY-6). Who may
 * read a scope is decided by the callers (plugins/memory, the Discord inject);
 * the store itself never returns private notes unless asked (MEMORY-7).
 */

import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import { scrubSecrets } from "../store/scrub.ts";
import {
  isMemoryCategory,
  MEMORY_CATEGORY_LIST,
  MemoryAclError,
  MemoryNotFoundError,
  MemoryValidationError,
  type MemoryCategory,
  type MemoryRecord,
  PRIVATE_NOTE_CATEGORY,
} from "./types.ts";

type MemoryRow = {
  id: string;
  owner_user_id: string;
  category: string;
  key: string;
  content: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  deleted_by_user_id: string | null;
};

function rowToRecord(row: MemoryRow): MemoryRecord {
  const rec: MemoryRecord = {
    id: row.id,
    ownerUserId: row.owner_user_id,
    category: row.category as MemoryCategory,
    key: row.key,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.deleted_at != null) rec.deletedAt = row.deleted_at;
  if (row.deleted_by_user_id) rec.deletedByUserId = row.deleted_by_user_id;
  return rec;
}

export type MemoryStoreOptions = {
  db: Database;
  now?: () => number;
};

export type StoreMemoryInput = {
  ownerUserId: string;
  category: string;
  key: string;
  content: string;
};

export type RecallMemoryInput = {
  ownerUserId: string;
  /**
   * Scopes to read instead of `ownerUserId` alone (a declared person's scope
   * plus the Discord ids their rows were stored under before they were
   * declared). A key stored in two of them is returned once, newest first.
   */
  scopes?: readonly string[];
  category?: string;
  /**
   * MEMORY-7: private notes are left out unless `category` is "private" or
   * this is true. Default false.
   */
  includePrivate?: boolean;
  query?: string;
  limit?: number;
  /** When true, include soft-deleted (admin audit). Default false. */
  includeDeleted?: boolean;
};

export type ForgetMemoryInput = {
  actorUserId: string;
  /** Target memory id. */
  id: string;
  /** ADMIN re-checked at handler time (MEMORY-ACL-3/4). */
  isAdmin: boolean;
};

export type OverrideMemoryInput = {
  actorUserId: string;
  id: string;
  content: string;
  isAdmin: boolean;
};

/**
 * Durable memories in shared corvidinho.db.
 * Without a db this class is not constructible — tests use openCorvidinhoDb({ memory: true }).
 */
export class MemoryStore {
  private readonly db: Database;
  private readonly now: () => number;

  constructor(opts: MemoryStoreOptions) {
    this.db = opts.db;
    this.now = opts.now ?? (() => Date.now());
  }

  store(input: StoreMemoryInput): MemoryRecord {
    const owner = input.ownerUserId.trim();
    if (!owner) {
      throw new MemoryValidationError("owner_user_id required");
    }
    if (!isMemoryCategory(input.category)) {
      throw new MemoryValidationError(
        `category must be one of: ${MEMORY_CATEGORY_LIST}`,
      );
    }
    // SAFE-6: scrub before persist (key and content).
    const key = scrubSecrets(input.key.trim());
    const content = scrubSecrets(input.content);
    if (!key) throw new MemoryValidationError("key required");
    if (!content.trim()) throw new MemoryValidationError("content required");

    const existing = this.db
      .query(
        `SELECT * FROM memories
         WHERE owner_user_id = ? AND category = ? AND key = ? AND deleted_at IS NULL`,
      )
      .get(owner, input.category, key) as MemoryRow | null;

    const ts = this.now();
    if (existing) {
      // Re-storing a key keeps the prior content as a soft-deleted row
      // (retrievable by ADMIN) — an update must never be a non-admin
      // forget path (MEMORY-ACL-4).
      this.db.run(
        `UPDATE memories SET deleted_at = ?, deleted_by_user_id = ?, updated_at = ? WHERE id = ?`,
        [ts, owner, ts, existing.id],
      );
    }

    const id = randomUUID();
    this.db.run(
      `INSERT INTO memories
        (id, owner_user_id, category, key, content, created_at, updated_at, deleted_at, deleted_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      [id, owner, input.category, key, content, ts, ts],
    );
    const row = this.db
      .query(`SELECT * FROM memories WHERE id = ?`)
      .get(id) as MemoryRow;
    return rowToRecord(row);
  }

  recall(input: RecallMemoryInput): MemoryRecord[] {
    const scopes = [
      ...new Set(
        (input.scopes ?? [input.ownerUserId]).map((s) => s.trim()).filter(Boolean),
      ),
    ];
    if (scopes.length === 0) return [];

    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const params: (string | number)[] = [...scopes];
    let sql = `SELECT * FROM memories WHERE owner_user_id IN (${scopes.map(() => "?").join(", ")})`;
    if (!input.includeDeleted) {
      sql += ` AND deleted_at IS NULL`;
    }
    if (input.category !== PRIVATE_NOTE_CATEGORY && !input.includePrivate) {
      sql += ` AND category <> ?`;
      params.push(PRIVATE_NOTE_CATEGORY);
    }
    if (input.category) {
      if (!isMemoryCategory(input.category)) {
        throw new MemoryValidationError(
          `category must be one of: ${MEMORY_CATEGORY_LIST}`,
        );
      }
      sql += ` AND category = ?`;
      params.push(input.category);
    }
    if (input.query?.trim()) {
      sql += ` AND (key LIKE ? OR content LIKE ?)`;
      const q = `%${input.query.trim()}%`;
      params.push(q, q);
    }
    sql += ` ORDER BY updated_at DESC, created_at DESC LIMIT ?`;
    // Several scopes may hold the same key: read enough to fill `limit`
    // after keeping only the newest of each.
    params.push(scopes.length > 1 ? limit * scopes.length : limit);

    const rows = (this.db.query(sql).all(...params) as MemoryRow[]).map(rowToRecord);
    if (scopes.length === 1 || input.includeDeleted) return rows.slice(0, limit);
    const seen = new Set<string>();
    const out: MemoryRecord[] = [];
    for (const r of rows) {
      const k = `${r.category}\u0000${r.key}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(r);
      if (out.length >= limit) break;
    }
    return out;
  }

  /**
   * Active rows per category across `scopes` (a profile's counts, MEMORY-5).
   * Private notes are counted too — a count shows no content.
   */
  countByCategory(scopes: readonly string[]): Record<string, number> {
    const list = [...new Set(scopes.map((s) => s.trim()).filter(Boolean))];
    if (list.length === 0) return {};
    const rows = this.db
      .query(
        `SELECT category, COUNT(DISTINCT category || char(0) || key) AS n FROM memories
         WHERE owner_user_id IN (${list.map(() => "?").join(", ")}) AND deleted_at IS NULL
         GROUP BY category`,
      )
      .all(...list) as Array<{ category: string; n: number }>;
    const out: Record<string, number> = {};
    for (const r of rows) out[r.category] = r.n;
    return out;
  }

  /**
   * MEMORY-ACL-6: delete every row of `scopes` for good — active and
   * soft-deleted (a re-stored key's earlier content, a forgotten row), so
   * nothing about them stays retrievable. Returns the rows deleted. Only
   * the owner-approved forget request calls this (src/discord/forget-card.ts).
   */
  purgeScopes(scopes: readonly string[]): number {
    const list = [...new Set(scopes.map((s) => s.trim()).filter(Boolean))];
    if (list.length === 0) return 0;
    const res = this.db.run(
      `DELETE FROM memories WHERE owner_user_id IN (${list.map(() => "?").join(", ")})`,
      list,
    );
    return Number(res.changes);
  }

  getById(id: string): MemoryRecord | undefined {
    const row = this.db
      .query(`SELECT * FROM memories WHERE id = ?`)
      .get(id) as MemoryRow | null;
    return row ? rowToRecord(row) : undefined;
  }

  /**
   * Soft-delete. ADMIN required for own and others (MEMORY-ACL-4).
   * Non-admin / empty-admin: opaque deny (MEMORY-ACL-2).
   */
  forget(input: ForgetMemoryInput): MemoryRecord {
    if (!input.isAdmin) {
      throw new MemoryAclError();
    }
    const row = this.db
      .query(`SELECT * FROM memories WHERE id = ?`)
      .get(input.id) as MemoryRow | null;
    if (!row || row.deleted_at != null) {
      // Opaque — do not reveal whether id existed or belonged to another user.
      throw new MemoryNotFoundError();
    }
    const ts = this.now();
    this.db.run(
      `UPDATE memories SET deleted_at = ?, deleted_by_user_id = ?, updated_at = ? WHERE id = ?`,
      [ts, input.actorUserId, ts, input.id],
    );
    const updated = this.db
      .query(`SELECT * FROM memories WHERE id = ?`)
      .get(input.id) as MemoryRow;
    return rowToRecord(updated);
  }

  /**
   * Override content. ADMIN required for own and others (MEMORY-ACL-3/4).
   */
  override(input: OverrideMemoryInput): MemoryRecord {
    if (!input.isAdmin) {
      throw new MemoryAclError();
    }
    if (!input.content.trim()) {
      throw new MemoryValidationError("content required");
    }
    const row = this.db
      .query(`SELECT * FROM memories WHERE id = ?`)
      .get(input.id) as MemoryRow | null;
    if (!row || row.deleted_at != null) {
      throw new MemoryNotFoundError();
    }
    const ts = this.now();
    this.db.run(
      `UPDATE memories SET content = ?, updated_at = ? WHERE id = ?`,
      [scrubSecrets(input.content), ts, input.id],
    );
    const updated = this.db
      .query(`SELECT * FROM memories WHERE id = ?`)
      .get(input.id) as MemoryRow;
    return rowToRecord(updated);
  }
}
