/**
 * MEMORY-5 — a person's profile, read from their memory scope (#101).
 *
 * Role comes from the owner's people list (IDENTITY-8, only the owner sets
 * it); projects, preferences and the history of decisions, asks and
 * approvals are the person's `project` / `preference` / `decision` / `ask` /
 * `approval` memories. Private notes are only counted here, never shown
 * (MEMORY-7: they are recalled only on an explicit ask by that person or the
 * owner).
 */

import type { MemoryStore } from "./store.ts";
import { subjectLabel, type MemorySubject } from "./scope.ts";
import { HISTORY_CATEGORIES, PRIVATE_NOTE_CATEGORY, type MemoryRecord } from "./types.ts";

/** Rows per profile section. */
export const PROFILE_SECTION_LIMIT = 20;

export type MemoryProfile = {
  kind: MemorySubject["kind"];
  id: string;
  displayName?: string;
  role: MemorySubject["role"];
  projects: MemoryRecord[];
  preferences: MemoryRecord[];
  /** Decisions, asks and approvals, newest first. */
  history: MemoryRecord[];
  /** Private notes kept (count only). */
  privateNotes: number;
  /** Other notes (conversation / entity / person / personality). */
  otherNotes: number;
};

export function buildMemoryProfile(
  store: MemoryStore,
  subject: MemorySubject,
  opts: { limit?: number } = {},
): MemoryProfile {
  const limit = opts.limit ?? PROFILE_SECTION_LIMIT;
  const scopes = subject.readScopes;
  const history = HISTORY_CATEGORIES.flatMap((category) =>
    store.recall({ ownerUserId: subject.writeScope, scopes, category, limit }),
  )
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
    .slice(0, limit);
  const counts = store.countByCategory(scopes);
  const profiled = new Set<string>(["project", "preference", ...HISTORY_CATEGORIES, PRIVATE_NOTE_CATEGORY]);
  const otherNotes = Object.entries(counts)
    .filter(([c]) => !profiled.has(c))
    .reduce((n, [, v]) => n + v, 0);
  return {
    kind: subject.kind,
    id: subject.id,
    ...(subject.displayName ? { displayName: subject.displayName } : {}),
    role: subject.role,
    projects: store.recall({ ownerUserId: subject.writeScope, scopes, category: "project", limit }),
    preferences: store.recall({ ownerUserId: subject.writeScope, scopes, category: "preference", limit }),
    history,
    privateNotes: counts[PRIVATE_NOTE_CATEGORY] ?? 0,
    otherNotes,
  };
}

function oneLine(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function day(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Plain-text profile (no private note content). */
export function formatMemoryProfile(p: MemoryProfile, subject: MemorySubject): string {
  const lines = [`Profile: ${subjectLabel(subject)}`, `- role: ${p.role}${p.kind === "user" ? " (not on the owner's people list)" : ""}`];
  const section = (title: string, rows: MemoryRecord[], empty: string, dated = false) => {
    lines.push(`- ${title}:`);
    if (rows.length === 0) lines.push(`  (${empty})`);
    for (const r of rows) {
      lines.push(`  - ${dated ? `${day(r.updatedAt)} ${r.category}` : r.key}${dated ? ` ${r.key}` : ""}: ${oneLine(r.content)}`);
    }
  };
  section("projects", p.projects, "none stored");
  section("preferences", p.preferences, "none stored");
  section("history (decisions, asks, approvals)", p.history, "none stored", true);
  lines.push(`- private notes: ${p.privateNotes} (shown only to them and the owner, on an explicit ask)`);
  lines.push(`- other notes: ${p.otherNotes}`);
  return lines.join("\n");
}
