/**
 * Tool-schema cost view (FLEDGE-5 / PLUGIN-6): how much context each loaded
 * plugin command costs when offered to the model, and whether the loaded tool
 * surface as a whole is over budget.
 *
 * Cost is measured on the exact tool definition `buildOpenAiTools` sends
 * (`toolDefForEntry`), serialized as JSON; tokens use the chars/4 estimate
 * Corvidinho already uses elsewhere. Numbers are approximate on purpose.
 */

import { toolDefForEntry } from "../agent/tools.ts";
import { get } from "./registry.ts";
import type { PluginListEntry } from "./types.ts";

/**
 * Default budget for the whole loaded tool surface (all commands offered).
 * ~9000 since the SpecSync change tools (AGENT-18 / AGENT-18.a) joined the
 * builtins: five more schemas at ~70 tokens of fixed shape each.
 */
export const TOOL_SURFACE_BUDGET_TOKENS = 9_000;
/** A single command schema above this is flagged as oversized. */
export const TOOL_SCHEMA_SOFT_CAP_TOKENS = 250;

export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export type ToolCostEntry = PluginListEntry & {
  /** "builtin" or "fledge:<plugin>@<version>" (FLEDGE-4 / PLUGIN-6). */
  origin: string;
  schemaChars: number;
  approxTokens: number;
};

export function withToolCost(entries: readonly PluginListEntry[]): ToolCostEntry[] {
  return entries.map((e) => {
    const json = JSON.stringify(toolDefForEntry(e));
    return {
      ...e,
      origin: get(e.name)?.origin ?? "builtin",
      schemaChars: json.length,
      approxTokens: approxTokens(json),
    };
  });
}

export type ToolSurfaceReport = {
  commands: number;
  totalTokens: number;
  budgetTokens: number;
  overBudget: boolean;
  softCapTokens: number;
  byOrigin: { origin: string; commands: number; approxTokens: number }[];
  largest: { name: string; approxTokens: number }[];
  oversized: string[];
};

export function toolSurfaceReport(
  entries: readonly ToolCostEntry[],
  opts: { budgetTokens?: number; softCapTokens?: number; top?: number } = {},
): ToolSurfaceReport {
  const budgetTokens = opts.budgetTokens ?? TOOL_SURFACE_BUDGET_TOKENS;
  const softCapTokens = opts.softCapTokens ?? TOOL_SCHEMA_SOFT_CAP_TOKENS;
  const top = opts.top ?? 3;
  const totalTokens = entries.reduce((n, e) => n + e.approxTokens, 0);
  const groups = new Map<string, { commands: number; approxTokens: number }>();
  for (const e of entries) {
    const g = groups.get(e.origin) ?? { commands: 0, approxTokens: 0 };
    g.commands += 1;
    g.approxTokens += e.approxTokens;
    groups.set(e.origin, g);
  }
  const byOrigin = [...groups.entries()]
    .map(([origin, g]) => ({ origin, ...g }))
    .sort((a, b) => b.approxTokens - a.approxTokens || a.origin.localeCompare(b.origin));
  const bySize = [...entries].sort(
    (a, b) => b.approxTokens - a.approxTokens || a.name.localeCompare(b.name),
  );
  return {
    commands: entries.length,
    totalTokens,
    budgetTokens,
    overBudget: totalTokens > budgetTokens,
    softCapTokens,
    byOrigin,
    largest: bySize.slice(0, top).map((e) => ({ name: e.name, approxTokens: e.approxTokens })),
    oversized: bySize.filter((e) => e.approxTokens > softCapTokens).map((e) => e.name),
  };
}

/** Text view for `corvidinho plugins list`. */
export function formatPluginsListText(
  entries: readonly ToolCostEntry[],
  report: ToolSurfaceReport,
  notes: readonly string[] = [],
): string {
  const lines: string[] = [`Loaded plugins (${entries.length}):`, ""];
  for (const e of entries) {
    const danger = e.dangerous ? "dangerous" : "safe";
    const origin = e.origin === "builtin" ? "" : `, ${e.origin}`;
    lines.push(
      `  ${e.name}  [${danger}, tier>=${e.minTier}${origin}]  ~${e.approxTokens} tok  ${e.description}`,
    );
  }
  lines.push("");
  lines.push(
    `Tool schema cost (FLEDGE-5 / PLUGIN-6): ~${report.totalTokens} tokens for ${report.commands} command(s) if all are offered; budget ~${report.budgetTokens}${report.overBudget ? " — OVER BUDGET" : ""}`,
  );
  for (const g of report.byOrigin) {
    lines.push(`  ${g.origin}: ${g.commands} command(s), ~${g.approxTokens} tokens`);
  }
  if (report.largest.length > 0) {
    lines.push(
      `  largest: ${report.largest.map((l) => `${l.name} ~${l.approxTokens}`).join(", ")}`,
    );
  }
  if (report.oversized.length > 0) {
    lines.push(
      `  oversized (> ~${report.softCapTokens} tokens each): ${report.oversized.join(", ")}`,
    );
  }
  for (const n of notes) lines.push(n);
  return lines.join("\n");
}
