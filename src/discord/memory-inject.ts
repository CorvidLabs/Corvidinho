/**
 * Discord MEMORY auto-recall inject (AGENT-7 / MEMORY-2 / MEMORY-4).
 *
 * Before spawning the agent, recall the acting Discord user's durable facts and
 * prepend a clear block so the model does not claim ignorance when rows exist.
 * Empty scope still gets a one-liner nudging memory-store for new durable facts.
 * No `/memory` slash — agent/prompt behavior only (draft #67 without new HI ids).
 */

import type { MemoryRecord, MemoryStore } from "../memory/index.ts";

/** Default recall cap for Discord spawn inject. */
export const MEMORY_INJECT_LIMIT = 20;

export const MEMORY_INJECT_HEADER =
  "[Corvidinho memory for this Discord user — use these facts; call memory-store for new durable facts the user states]";

export const MEMORY_INJECT_EMPTY =
  "(no stored memories yet — call memory-store when the user states durable facts about themselves/people/projects)";

export type MemoryInjectResult = {
  /** Prompt with memory block prepended (or original when store/user missing). */
  prompt: string;
  /** Number of recalled rows injected (0 when empty or skipped). */
  count: number;
  /** True when a memory block was prepended (including empty one-liner). */
  injected: boolean;
};

/**
 * Format recalled rows into the Discord spawn inject block.
 * Pure — no I/O. Always includes the header; empty → empty one-liner.
 */
export function formatMemoryInjectBlock(
  records: ReadonlyArray<Pick<MemoryRecord, "category" | "key" | "content">>,
): string {
  const lines = [MEMORY_INJECT_HEADER];
  if (records.length === 0) {
    lines.push(MEMORY_INJECT_EMPTY);
  } else {
    for (const r of records) {
      const content = String(r.content ?? "").replace(/\s+/g, " ").trim();
      lines.push(`- ${r.category}/${r.key}: ${content}`);
    }
  }
  return lines.join("\n");
}

export type EnrichPromptWithMemoriesOpts = {
  /** Acting Discord user id (MEMORY-ACL-1 owner scope). */
  ownerUserId: string;
  /** Max rows to recall (default MEMORY_INJECT_LIMIT). */
  limit?: number;
};

/**
 * Recall for ownerUserId and prepend the memory block to `text`.
 * When `store` is undefined or ownerUserId is blank, returns text unchanged
 * (injected=false) so bridges without MEMORY still work.
 */
export function enrichPromptWithMemories(
  text: string,
  store: MemoryStore | undefined,
  opts: EnrichPromptWithMemoriesOpts,
): MemoryInjectResult {
  const owner = opts.ownerUserId?.trim() ?? "";
  if (!store || !owner) {
    return { prompt: text, count: 0, injected: false };
  }

  const limit = opts.limit ?? MEMORY_INJECT_LIMIT;
  const rows = store.recall({ ownerUserId: owner, limit });
  const block = formatMemoryInjectBlock(rows);
  const prompt = text.trim().length > 0 ? `${block}\n\n${text}` : block;
  return { prompt, count: rows.length, injected: true };
}
