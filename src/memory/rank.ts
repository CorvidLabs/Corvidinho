/**
 * Ranked recall (MEMORY-9, #67): a search of memory returns the rows most
 * relevant to what was asked, the newer first among equals, instead of only
 * rows holding the whole query as one substring.
 *
 * Pure scoring over the candidate rows `MemoryStore.recall` reads (no FTS
 * table, no schema change): the query is split into terms (lowercased
 * letters/digits, short words and common question words dropped, lightly
 * stemmed); a term
 * weighs more the fewer candidate rows hold it (inverse document frequency);
 * a hit in the key counts double; holding the whole query adds a bonus; and
 * the score is lowered for older rows (a 30-day half-life, never below 3/4
 * of the relevance) so relevance leads and recency breaks near-ties.
 */

import type { MemoryStore, RecallMemoryInput } from "./store.ts";
import type { MemoryRecord } from "./types.ts";

/** Most query terms scored (the rest are ignored). */
export const RECALL_MAX_TERMS = 24;

/** Most candidate rows read before ranking. */
export const RECALL_CANDIDATE_LIMIT = 500;

/** Age at which a row's recency weight halves. */
export const RECALL_RECENCY_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Words that say nothing about which memory is wanted (question words,
 * pronouns, auxiliaries). A query of only these falls back to the whole-query
 * match.
 */
export const RECALL_STOPWORDS: ReadonlySet<string> = new Set([
  "a", "about", "am", "an", "and", "any", "are", "as", "at", "be", "been", "but", "by",
  "can", "could", "did", "do", "does", "doing", "don", "for", "from", "had", "has", "have",
  "he", "her", "hers", "him", "his", "how", "i", "if", "in", "into", "is", "it", "its",
  "just", "know", "let", "like", "me", "mine", "my", "no", "not", "of", "on", "or", "our",
  "ours", "please", "remember", "recall", "she", "should", "so", "tell", "than", "that",
  "the", "their", "them", "then", "there", "these", "they", "this", "those", "to", "us",
  "was", "we", "were", "what", "when", "where", "which", "who", "whom", "whose", "why",
  "will", "with", "would", "you", "your", "yours",
]);

/**
 * A light English stem so "tests" finds "test" and "deployed" finds "deploy":
 * a plural `s` (not `ss`), `ing` or `ed` is dropped from longer words. Terms
 * match as substrings, so the stem still finds the longer forms.
 */
export function stemTerm(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/**
 * Search terms of `query`: lowercased runs of letters/digits, at least two
 * characters, stopwords dropped, stemmed ({@link stemTerm}), first
 * occurrence kept, at most {@link RECALL_MAX_TERMS}.
 */
export function recallTerms(query: string | undefined | null): string[] {
  const words = (query ?? "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const out: string[] = [];
  for (const w of words) {
    if (w.length < 2 || RECALL_STOPWORDS.has(w)) continue;
    const t = stemTerm(w);
    if (out.includes(t)) continue;
    out.push(t);
    if (out.length >= RECALL_MAX_TERMS) break;
  }
  return out;
}

export type RankedMemory = { record: MemoryRecord; score: number };

/**
 * Score `rows` for `query` at `now` and return the matching ones, best first
 * (ties: newer first). A row matches when it holds a term or the whole query
 * (case-insensitive); rows that hold neither are left out.
 */
export function rankMemories(
  rows: readonly MemoryRecord[],
  query: string,
  now: number,
): RankedMemory[] {
  const phrase = query.trim().toLowerCase();
  const terms = recallTerms(query);
  if (!phrase && terms.length === 0) return [];
  const texts = rows.map((r) => ({ key: r.key.toLowerCase(), content: r.content.toLowerCase() }));
  const n = rows.length;
  const idf = new Map<string, number>();
  for (const t of terms) {
    const df = texts.filter((x) => x.key.includes(t) || x.content.includes(t)).length;
    if (df > 0) idf.set(t, Math.log(1 + n / df));
  }
  const out: RankedMemory[] = [];
  rows.forEach((record, i) => {
    const { key, content } = texts[i]!;
    let relevance = 0;
    for (const [t, w] of idf) {
      if (key.includes(t)) relevance += 2 * w;
      else if (content.includes(t)) relevance += w;
    }
    if (phrase && (key.includes(phrase) || content.includes(phrase))) relevance += 2;
    if (relevance <= 0) return;
    const age = Math.max(0, now - record.updatedAt);
    const recency = Math.pow(0.5, age / RECALL_RECENCY_HALF_LIFE_MS);
    out.push({ record, score: relevance * (0.75 + 0.25 * recency) });
  });
  return out.sort(
    (a, b) =>
      b.score - a.score ||
      b.record.updatedAt - a.record.updatedAt ||
      b.record.createdAt - a.record.createdAt,
  );
}

/**
 * What a prompt inject holds (MEMORY-9): the rows most relevant to `query`
 * first (a ranked search), then the newest rows to fill up to `limit` — so a
 * message about an older fact still carries it, and a message that matches
 * nothing carries the newest facts as before. Private notes stay out
 * (MEMORY-7: `recall` leaves them out unless asked).
 */
export function recallRelevantThenRecent(
  store: Pick<MemoryStore, "recall">,
  input: Pick<RecallMemoryInput, "ownerUserId" | "scopes"> & { query?: string; limit: number },
): MemoryRecord[] {
  const base = { ownerUserId: input.ownerUserId, ...(input.scopes ? { scopes: input.scopes } : {}) };
  const relevant = recallTerms(input.query).length > 0
    ? store.recall({ ...base, query: input.query, limit: input.limit })
    : [];
  if (relevant.length >= input.limit) return relevant;
  const seen = new Set(relevant.map((r) => r.id));
  const recent = store
    .recall({ ...base, limit: input.limit })
    .filter((r) => !seen.has(r.id));
  return [...relevant, ...recent].slice(0, input.limit);
}
