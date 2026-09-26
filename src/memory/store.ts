/**
 * Local SQLite MemoryStore with per-user ACL (MEMORY-1..4 / MEMORY-ACL-1..5).
 */

import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import { scrubSecrets } from "../store/scrub.ts";
import {
  isMemoryCategory,
  MemoryAclError,
  MemoryNotFoundError,
  MemoryValidationError,
  type MemoryCategory,
  type MemoryRecord,
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
  category?: string;
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
        `category must be one of: conversation, entity, person, personality`,
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
      // Own-scope upsert is store, not override — same owner only (ACL-1).
      this.db.run(
        `UPDATE memories SET content = ?, updated_at = ? WHERE id = ?`,
        [content, ts, existing.id],
      );
      const updated = this.db
        .query(`SELECT * FROM memories WHERE id = ?`)
        .get(existing.id) as MemoryRow;
      return rowToRecord(updated);
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
    const owner = input.ownerUserId.trim();
    if (!owner) return [];

    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const params: (string | number)[] = [owner];
    let sql = `SELECT * FROM memories WHERE owner_user_id = ?`;
    if (!input.includeDeleted) {
      sql += ` AND deleted_at IS NULL`;
    }
    if (input.category) {
      if (!isMemoryCategory(input.category)) {
        throw new MemoryValidationError(
          `category must be one of: conversation, entity, person, personality`,
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
    sql += ` ORDER BY updated_at DESC LIMIT ?`;
    params.push(limit);

    const rows = this.db.query(sql).all(...params) as MemoryRow[];
    return rows.map(rowToRecord);
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
