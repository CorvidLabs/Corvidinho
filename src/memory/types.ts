/**
 * MEMORY categories and row shapes (HI MEMORY-1..2, MEMORY-5..7).
 */

export const MEMORY_CATEGORIES = [
  "conversation",
  "entity",
  "person",
  "personality",
  // MEMORY-5 — a person's profile: their projects, their preferences (how
  // they like to be talked to, timezone, hours) and a history of their
  // decisions, asks and approvals. Their role is not stored here: it is the
  // owner's people list (IDENTITY-8).
  "project",
  "preference",
  "decision",
  "ask",
  "approval",
  // MEMORY-7 — private notes: never auto-injected into a prompt, recalled
  // only on an explicit ask by that person or the owner.
  "private",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

/** Human list for refusals and tool descriptions. */
export const MEMORY_CATEGORY_LIST = MEMORY_CATEGORIES.join(", ");

/** A person's history (MEMORY-5): decisions, asks and approvals, newest first. */
export const HISTORY_CATEGORIES: readonly MemoryCategory[] = ["decision", "ask", "approval"];

/** Private notes (MEMORY-7): shown only to that person and the owner. */
export const PRIVATE_NOTE_CATEGORY: MemoryCategory = "private";

export function isMemoryCategory(value: string): value is MemoryCategory {
  return (MEMORY_CATEGORIES as readonly string[]).includes(value);
}

export type MemoryRecord = {
  id: string;
  ownerUserId: string;
  category: MemoryCategory;
  key: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  deletedByUserId?: string;
};

/** Opaque refuse — never include other users' content (MEMORY-ACL-2). */
export const MEMORY_ACL_DENIED = "not authorized";

export class MemoryAclError extends Error {
  readonly code = "MEMORY_ACL_DENIED";
  constructor(message = MEMORY_ACL_DENIED) {
    super(message);
    this.name = "MemoryAclError";
  }
}

export class MemoryNotFoundError extends Error {
  readonly code = "MEMORY_NOT_FOUND";
  constructor(message = "memory not found") {
    super(message);
    this.name = "MemoryNotFoundError";
  }
}

export class MemoryValidationError extends Error {
  readonly code = "MEMORY_VALIDATION";
  constructor(message: string) {
    super(message);
    this.name = "MemoryValidationError";
  }
}
