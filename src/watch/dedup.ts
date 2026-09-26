/**
 * Processed-id dedup for WATCH poll cycles.
 */

import type { DetectedEvent } from "./types.ts";

/** Return events whose ids are not in processedIds. */
export function filterNewEvents(
  events: DetectedEvent[],
  processedIds: Iterable<string>,
): DetectedEvent[] {
  const seen = new Set(
    [...processedIds].map((id) => id.toLowerCase()),
  );
  return events.filter((e) => !seen.has(e.id.toLowerCase()));
}

/** Keep newest event per repo#number (events expected newest-first). */
export function dedupeByIssue(events: DetectedEvent[]): DetectedEvent[] {
  const seen = new Set<string>();
  const out: DetectedEvent[] = [];
  for (const e of events) {
    const key = `${e.repo.toLowerCase()}#${e.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export class ProcessedIdStore {
  private ids = new Set<string>();
  private readonly maxSize: number;

  constructor(maxSize = 2000) {
    this.maxSize = maxSize;
  }

  has(id: string): boolean {
    return this.ids.has(id.toLowerCase());
  }

  add(id: string): void {
    this.ids.add(id.toLowerCase());
    if (this.ids.size > this.maxSize) {
      const first = this.ids.values().next().value;
      if (first !== undefined) this.ids.delete(first);
    }
  }

  addMany(ids: string[]): void {
    for (const id of ids) this.add(id);
  }

  list(): string[] {
    return [...this.ids];
  }
}
