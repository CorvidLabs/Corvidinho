/**
 * Spec loading and relevance scoring (Merlin crates/merlin-core/src/spec_loader.rs steal).
 * Used at Planning to pick relevant module specs and inject constraints.
 * Does not reimplement SpecSync — reads via plugin helpers / project files.
 */

import {
  listRegisteredModules,
  readCompanions,
  readModuleSpec,
} from "../../plugins/specsync/api.ts";

const CONSTRAINT_SECTIONS = [
  "Purpose",
  "Invariants",
  "Public API",
  "Error Cases",
] as const;

const MIN_TOKEN_LEN = 3;

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "into",
  "onto",
  "out",
  "you",
  "are",
  "any",
  "all",
  "has",
  "have",
  "had",
  "but",
  "not",
  "use",
  "using",
  "make",
  "made",
]);

export type SpecRef = {
  name: string;
  score: number;
};

function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  const lower = text.toLowerCase();
  let buf = "";
  const flush = () => {
    if (buf.length >= MIN_TOKEN_LEN && !STOP_WORDS.has(buf)) out.add(buf);
    buf = "";
  };
  for (const ch of lower) {
    if (/[a-z0-9]/.test(ch)) buf += ch;
    else flush();
  }
  flush();
  return out;
}

function overlapCount(taskTokens: Set<string>, nameTokens: Set<string>): number {
  let n = 0;
  for (const t of taskTokens) {
    if (nameTokens.has(t)) n += 1;
  }
  return n;
}

/** Score specs by token overlap; return top_n sorted by score desc, name asc. */
export function selectRelevantSpecs(
  task: string,
  allSpecs: string[],
  topN: number,
): SpecRef[] {
  const taskTokens = tokenize(task);
  if (taskTokens.size === 0 || allSpecs.length === 0) return [];
  const scored: SpecRef[] = allSpecs
    .map((name) => ({
      name,
      score: overlapCount(taskTokens, tokenize(name)),
    }))
    .filter((s) => s.score > 0);
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return scored.slice(0, topN);
}

function stripFrontmatter(content: string): string {
  const trimmed = content.replace(/^\uFEFF?/, "").replace(/^\s*/, "");
  if (!trimmed.startsWith("---\n") && !trimmed.startsWith("---\r\n")) {
    return content;
  }
  const rest = trimmed.slice(4);
  const endNl = rest.indexOf("\n---\n");
  if (endNl >= 0) return rest.slice(endNl + 5);
  const endBare = rest.indexOf("\n---");
  if (endBare >= 0) return rest.slice(endBare + 4);
  return content;
}

function extractSection(body: string, heading: string): string | null {
  const needle = `## ${heading}`;
  const start = body.indexOf(needle);
  if (start < 0) return null;
  const after = body.slice(start + needle.length).replace(/^\n+/, "");
  const nextH2 = after.indexOf("\n## ");
  const nextH1 = after.indexOf("\n# ");
  let end = after.length;
  if (nextH2 >= 0) end = Math.min(end, nextH2);
  if (nextH1 >= 0) end = Math.min(end, nextH1);
  return after.slice(0, end);
}

/** Extract Purpose / Invariants / Public API / Error Cases; else full body. */
export function extractConstraintSections(
  specName: string,
  fullContent: string,
): string {
  const body = stripFrontmatter(fullContent);
  let output = `# Spec: ${specName}\n\n`;
  let foundAny = false;
  for (const section of CONSTRAINT_SECTIONS) {
    const text = extractSection(body, section);
    if (text != null) {
      output += `## ${section}\n${text.trim()}\n\n`;
      foundAny = true;
    }
  }
  if (foundAny) return output.trimEnd();
  return `# Spec: ${specName}\n\n${body.trim()}`;
}

export type LoadRelevantSpecsOptions = {
  cwd: string;
  task: string;
  topN?: number;
  /** Include companion files (SPECSYNC-5). Default true. */
  includeCompanions?: boolean;
};

/**
 * Merlin Planning path: list → select → read → extract (+ companions).
 * Soft-fail: returns empty string when nothing loads.
 */
export function loadRelevantSpecs(opts: LoadRelevantSpecsOptions): string {
  const topN = opts.topN ?? 3;
  const includeCompanions = opts.includeCompanions ?? true;
  let names: string[];
  try {
    names = listRegisteredModules(opts.cwd);
  } catch {
    return "";
  }
  // Drop count header style lines if any slipped in
  names = names.filter((n) => n && !n.startsWith("(") && !/\s/.test(n));
  if (names.length === 0) return "";

  const picks = selectRelevantSpecs(opts.task, names, topN);
  if (picks.length === 0) return "";

  const parts: string[] = [];
  for (const pick of picks) {
    const spec = readModuleSpec(opts.cwd, pick.name);
    if (!spec.ok) continue;
    parts.push(extractConstraintSections(pick.name, spec.content));
    if (includeCompanions) {
      const companions = readCompanions(opts.cwd, pick.name);
      for (const f of companions.files) {
        // Prefer context + tasks for briefing; keep others short
        if (f.name === "context.md" || f.name === "tasks.md") {
          const trimmed = f.content.trim();
          if (trimmed) {
            parts.push(`# Companion: ${pick.name}/${f.name}\n\n${trimmed}`);
          }
        }
      }
    }
  }
  return parts.join("\n\n");
}
