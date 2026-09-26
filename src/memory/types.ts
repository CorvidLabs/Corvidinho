/**
 * MEMORY categories and row shapes (HI MEMORY-1..2).
 */

export const MEMORY_CATEGORIES = [
  "conversation",
  "entity",
  "person",
  "personality",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

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
